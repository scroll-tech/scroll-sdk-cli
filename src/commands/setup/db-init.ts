import { Command, Flags } from '@oclif/core'
import { input, password, confirm } from '@inquirer/prompts'
import pg from 'pg';
import * as fs from 'fs'
import * as path from 'path'
import * as toml from '@iarna/toml'
import chalk from 'chalk'

export default class SetupDbInit extends Command {
  static override description = 'Initialize databases with new users and passwords interactively or update permissions'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
    '<%= config.bin %> <%= command.id %> --update-permissions',
    '<%= config.bin %> <%= command.id %> --update-permissions --debug',
    '<%= config.bin %> <%= command.id %> --clean',
    '<%= config.bin %> <%= command.id %> --update-db-port=25061',
  ]

  static override flags = {
    'update-permissions': Flags.boolean({
      char: 'u',
      description: 'Update permissions for existing users',
      default: false,
    }),
    debug: Flags.boolean({
      char: 'd',
      description: 'Show debug output including SQL queries',
      default: false,
    }),
    clean: Flags.boolean({
      char: 'c',
      description: 'Delete existing database and user before creating new ones',
      default: false,
    }),
    'update-port': Flags.integer({
      description: 'Update the port of current database values',
      required: false,
    }),
  }

  private conn: pg.Client | undefined;
  private publicHost: string = "";
  private publicPort: string = "";
  private vpcHost: string = "";
  private vpcPort: string = "";
  private pgUser: string = "";
  private pgPassword: string = "";
  private pgDatabase: string = "";

  private async initializeDatabase(conn: pg.Client, dbName: string, dbUser: string, dbPassword: string, clean: boolean): Promise<void> {
    try {
      // Check if the database exists
      const dbExistsResult = await conn.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName])
      if (dbExistsResult.rows.length > 0) {
        if (clean) {
          this.log(chalk.yellow(`Deleting existing database ${dbName}...`))
          // Terminate all connections to the database
          await conn.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1`, [dbName])
          await conn.query(`DROP DATABASE IF EXISTS ${dbName}`)
          this.log(chalk.green(`Database ${dbName} deleted successfully.`))
        } else {
          this.log(chalk.yellow(`Database ${dbName} already exists.`))
        }
      }

      if (clean || dbExistsResult.rows.length === 0) {
        this.log(chalk.blue(`Creating database ${dbName}...`))
        await conn.query(`CREATE DATABASE ${dbName}`)
        this.log(chalk.green(`Database ${dbName} created successfully.`))
      }

      // Check if the user exists
      const userExistsResult = await conn.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [dbUser])
      if (userExistsResult.rows.length > 0) {
        if (clean) {
          this.log(chalk.yellow(`User ${dbUser} already exists. Updating password...`))
          await conn.query(`ALTER USER ${dbUser} WITH PASSWORD '${dbPassword.replace(/'/g, "''")}'`)
          this.log(chalk.green(`Password updated for ${dbUser}.`))
        } else {
          const changePassword = await confirm({ message: `User ${dbUser} already exists. Do you want to change the password?` })
          if (changePassword) {
            await conn.query(`ALTER USER ${dbUser} WITH PASSWORD '${dbPassword.replace(/'/g, "''")}'`)
            this.log(chalk.green(`Password updated for ${dbUser}.`))
          } else {
            this.log(chalk.yellow(`Password not changed for ${dbUser}. Please manually check the user's password in config.toml.`))
          }
        }
      } else {
        this.log(chalk.blue(`Creating user ${dbUser}...`))
        await conn.query(`CREATE USER ${dbUser} WITH PASSWORD '${dbPassword.replace(/'/g, "''")}'`)
        this.log(chalk.green(`User ${dbUser} created successfully.`))
      }

      // Update permissions
      await this.updatePermissions(conn, dbName, dbUser, false) // Pass false for debug flag

    } catch (error) {
      this.error(chalk.red(`Failed to initialize database: ${error}`))
    }
  }

  private async updateConfigFile(dsnMap: Record<string, string>): Promise<void> {
    const configPath = path.join(process.cwd(), 'config.toml')
    if (!fs.existsSync(configPath)) {
      this.log(chalk.yellow('config.toml not found in the current directory. Skipping update.'))
      return
    }

    const configContent = fs.readFileSync(configPath, 'utf-8')
    const config = toml.parse(configContent)

    if (!config.db) {
      config.db = {}
    }

    const dsnConfigMapping: Record<string, string[]> = {
      'ROLLUP_NODE': ['SCROLL_DB_CONNECTION_STRING', 'GAS_ORACLE_DB_CONNECTION_STRING', 'ROLLUP_NODE_DB_CONNECTION_STRING', 'ROLLUP_EXPLORER_DB_CONNECTION_STRING', 'COORDINATOR_DB_CONNECTION_STRING', 'ADMIN_SYSTEM_BACKEND_DB_CONNECTION_STRING'],
      'BRIDGE_HISTORY': ['BRIDGE_HISTORY_DB_CONNECTION_STRING'],
      'CHAIN_MONITOR': ['CHAIN_MONITOR_DB_CONNECTION_STRING'],
      'BLOCKSCOUT': ['BLOCKSCOUT_DB_CONNECTION_STRING'],
      'L1_EXPLORER': ['L1_EXPLORER_DB_CONNECTION_STRING']
    }

    for (const [user, dsn] of Object.entries(dsnMap)) {
      const configKeys = dsnConfigMapping[user] || []
      for (const key of configKeys) {
        (config.db as Record<string, string>)[key] = dsn
      }
    }

    fs.writeFileSync(configPath, toml.stringify(config as any))
    this.log(chalk.green('config.toml has been updated with the new database connection strings.'))
  }

  private async updatePermissions(conn: pg.Client, dbName: string, dbUser: string, debug: boolean): Promise<void> {
    const queries = [
      `GRANT CONNECT ON DATABASE ${dbName} TO ${dbUser}`,
      `GRANT ALL PRIVILEGES ON DATABASE ${dbName} TO ${dbUser}`,
    ];

    const schemaQueries = [
      `CREATE SCHEMA IF NOT EXISTS public`,
      `GRANT ALL PRIVILEGES ON SCHEMA public TO ${dbUser}`,
      `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${dbUser}`,
      `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${dbUser}`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${dbUser}`,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${dbUser}`
    ];

    try {
      // Execute queries on the original connection (usually connected to 'postgres' database)
      for (const query of queries) {
        if (debug) {
          this.log(chalk.cyan(`Executing query: ${query}`));
        }
        const result = await conn.query(query);
        if (debug) {
          this.log(chalk.yellow('Query result:'));
          this.log(JSON.stringify(result, null, 2));
        }
      }

      // Create a new connection to the specific database
      const dbConn = await this.createConnection(this.publicHost, this.publicPort, this.pgUser, this.pgPassword, dbName);

      // Execute schema-specific queries on the new connection
      for (const query of schemaQueries) {
        if (debug) {
          this.log(chalk.cyan(`Executing query on ${dbName}: ${query}`));
        }
        const result = await dbConn.query(query);
        if (debug) {
          this.log(chalk.yellow('Query result:'));
          this.log(JSON.stringify(result, null, 2));
        }
      }

      // Close the database-specific connection
      await dbConn.end();

      this.log(chalk.green(`Permissions updated for ${dbUser} on ${dbName}.`))
    } catch (error) {
      this.error(chalk.red(`Failed to update permissions: ${error}`))
    }
  }

  private updateDatabasePort(config: any, newPort: number): void {
    const dbSection = config.db as Record<string, string>
    if (!dbSection) {
      this.log(chalk.yellow('No database configurations found in config.toml'))
      return
    }

    let changes = false
    for (const [key, value] of Object.entries(dbSection)) {
      if (typeof value === 'string' && value.includes('postgres://')) {
        const updatedValue = value.replace(/:\d+\//, `:${newPort}/`)
        if (updatedValue !== value) {
          dbSection[key] = updatedValue
          changes = true
          this.log(chalk.blue(`Updated ${key}:`))
          this.log(chalk.red(`- ${value}`))
          this.log(chalk.green(`+ ${updatedValue}`))
        }
      }
    }

    if (!changes) {
      this.log(chalk.yellow('No database configurations were updated'))
    }
  }

  private async getExistingConfig(): Promise<any> {
    const configPath = path.join(process.cwd(), 'config.toml')
    if (!fs.existsSync(configPath)) {
      this.error('config.toml not found in the current directory.')
      return {}
    }

    const configContent = fs.readFileSync(configPath, 'utf-8')
    return toml.parse(configContent) as any
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(SetupDbInit)
    const existingConfig = await this.getExistingConfig()

    if (flags['update-port']) {
      this.log(chalk.blue('Updating database port...'))
      this.updateDatabasePort(existingConfig, flags['update-port'])

      const confirmUpdate = await confirm({
        message: 'Do you want to update the config.toml file with these changes?'
      })

      if (confirmUpdate) {
        fs.writeFileSync(path.join(process.cwd(), 'config.toml'), toml.stringify(existingConfig as any))
        this.log(chalk.green('config.toml has been updated with the new database port.'))
      } else {
        this.log(chalk.yellow('Configuration update cancelled.'))
      }
      return
    }

    if (flags.clean) {
      const confirmClean = await confirm({
        message: chalk.red('WARNING: This will erase existing databases and overwrite user passwords. Do you want to continue?'),
      })
      if (!confirmClean) {
        this.log(chalk.yellow('Operation aborted.'))
        return
      }
    }

    const databases = [
      { name: 'scroll_chain_monitor', user: 'CHAIN_MONITOR' },
      { name: 'scroll_rollup', user: 'ROLLUP_NODE' },
      { name: 'scroll_bridge_history', user: 'BRIDGE_HISTORY' },
    ]

    const createBlockscout = await confirm({
      message: chalk.cyan('Do you want to create a database for Blockscout?'),
      default: !!existingConfig.db?.BLOCKSCOUT_DB_CONNECTION_STRING
    })
    if (createBlockscout) {
      databases.push({ name: 'scroll_blockscout', user: 'BLOCKSCOUT' })
    }

    const createL1Explorer = await confirm({
      message: chalk.cyan('Do you want to create a database for L1 Explorer?'),
      default: !!existingConfig.db?.L1_EXPLORER_DB_CONNECTION_STRING
    })
    if (createL1Explorer) {
      databases.push({ name: 'scroll_l1explorer', user: 'L1_EXPLORER' })
    }

    const dsnMap: Record<string, string> = {}

    try {
      // If updating permissions, we only need to connect once
      if (flags['update-permissions']) {
        [this.publicHost, this.publicPort, this.pgUser, this.pgPassword, this.pgDatabase] = await this.promptForPublicConnectionDetails(existingConfig);
        this.conn = await this.createConnection(this.publicHost, this.publicPort, this.pgUser, this.pgPassword, this.pgDatabase);
      }

      for (const db of databases) {
        this.log(chalk.blue(`Setting up db for ${db.name}`));

        if (!flags['update-permissions']) {
          // First iteration or if the user chose to connect to a different cluster
          if (!this.conn) {
            [this.publicHost, this.publicPort, this.vpcHost, this.vpcPort, this.pgUser, this.pgPassword, this.pgDatabase] = await this.promptForConnectionDetails(existingConfig);
            this.conn = await this.createConnection(this.publicHost, this.publicPort, this.pgUser, this.pgPassword, this.pgDatabase);
          } else if (await confirm({ message: 'Do you want to connect to a different database cluster for this database?', default: false })) {
            // User chose to connect to a different cluster
            await this.conn.end();
            [this.publicHost, this.publicPort, this.vpcHost, this.vpcPort, this.pgUser, this.pgPassword, this.pgDatabase] = await this.promptForConnectionDetails(existingConfig);
            this.conn = await this.createConnection(this.publicHost, this.publicPort, this.pgUser, this.pgPassword, this.pgDatabase);
          }
        }

        if (!this.conn) {
          throw new Error('Database connection not established');
        }

        if (flags['update-permissions']) {
          if (flags.debug) {
            this.log(chalk.yellow('Debug mode: Showing SQL queries'));
          }
          await this.updatePermissions(this.conn, db.name, db.user.toLowerCase(), flags.debug)
        } else {
          this.log(chalk.blue(`Setting up database: ${db.name} for user: ${db.user}`))

          let dbPassword: string;
          const existingDsn = existingConfig.db?.[`${db.user}_DB_CONNECTION_STRING`];
          if (existingDsn) {
            const keepExistingPassword = await confirm({
              message: `An existing password was found for ${db.user}. Do you want to keep it?`,
              default: true
            });
            if (keepExistingPassword) {
              dbPassword = existingDsn.match(/postgres:\/\/.*:(.*)@/)?.[1] || '';
              this.log(chalk.green(`Using existing password for ${db.user}`));
            } else {
              const useRandomPassword = await confirm({
                message: `Do you want to use a random password for ${db.user}?`,
                default: true
              });
              if (useRandomPassword) {
                dbPassword = Math.random().toString(36).slice(-12); // Generate a random 12-character password
                this.log(chalk.green(`Generated random password for ${db.user}`));
              } else {
                dbPassword = await password({ message: `Enter new password for ${db.user}:` });
              }
            }
          } else {
            const useRandomPassword = await confirm({
              message: `Do you want to use a random password for ${db.user}?`,
              default: true
            });
            if (useRandomPassword) {
              dbPassword = Math.random().toString(36).slice(-12); // Generate a random 12-character password
              this.log(chalk.green(`Generated random password for ${db.user}`));
            } else {
              dbPassword = await password({ message: `Enter password for ${db.user}:` });
            }
          }

          await this.initializeDatabase(this.conn, db.name, db.user.toLowerCase(), dbPassword, flags.clean)

          const dsn = `postgres://${db.user.toLowerCase()}:${dbPassword}@${this.vpcHost}:${this.vpcPort}/${db.name}?sslmode=require`
          this.log(chalk.cyan(`DSN for ${db.user}:\n${dsn}`))

          dsnMap[db.user] = dsn
        }
      }

      if (!flags['update-permissions']) {
        this.log(chalk.green('All databases initialized successfully.'))

        const updateConfig = await confirm({ message: 'Do you want to update the config.toml file with the new DSNs?' })
        if (updateConfig) {
          await this.updateConfigFile(dsnMap)
        }
      } else {
        this.log(chalk.green('Permissions updated for all databases.'))
      }
    } finally {
      if (this.conn) {
        await this.conn.end()
      }
    }
  }

  private async promptForConnectionDetails(existingConfig: any): Promise<[string, string, string, string, string, string, string]> {
    this.log(chalk.blue('First, provide connection information for the database instance. This will only be used for creating users and databases. This information will not be persisted in your configuration repo.'));
    const publicHost = await input({ message: 'Enter public PostgreSQL host:', default: 'localhost' })
    const publicPort = await input({ message: 'Enter public PostgreSQL port:', default: '5432' })
    const pgUser = await input({ message: 'Enter PostgreSQL admin username:', default: 'admin' })
    const pgPassword = await password({ message: 'Enter PostgreSQL admin password:' })
    const pgDatabase = await input({ message: 'Enter PostgreSQL database name:', default: 'postgres' })

    this.log(chalk.blue('Now, provide connection information for pods. This will often be use localhost or a private IP. This information is stored in DSN strings in your configuration file and used in Secrets.'));

    // Extract host and port from an existing DSN if available
    let defaultPrivateHost = 'localhost'
    let defaultPrivatePort = '5432'
    const existingDsn = existingConfig.db?.SCROLL_DB_CONNECTION_STRING
    if (existingDsn) {
      const dsnMatch = existingDsn.match(/postgres:\/\/.*:.*@(.+):(\d+)\/.*/)
      if (dsnMatch) {
        defaultPrivateHost = dsnMatch[1]
        defaultPrivatePort = dsnMatch[2]
      }
    }

    const privateHost = await input({ message: 'Enter PostgreSQL host:', default: defaultPrivateHost })
    const privatePort = await input({ message: 'Enter PostgreSQL port:', default: defaultPrivatePort })

    return [publicHost, publicPort, privateHost, privatePort, pgUser, pgPassword, pgDatabase]
  }

  private async promptForPublicConnectionDetails(existingConfig: any): Promise<[string, string, string, string, string]> {
    this.log(chalk.blue('Provide connection information for the database instance. This will only be used for updating permissions.'));

    // Extract host and port from an existing DSN if available
    let defaultHost = 'localhost'
    let defaultPort = '5432'
    const existingDsn = existingConfig.db?.SCROLL_DB_CONNECTION_STRING
    if (existingDsn) {
      const dsnMatch = existingDsn.match(/postgres:\/\/.*:.*@(.+):(\d+)\/.*/)
      if (dsnMatch) {
        defaultHost = dsnMatch[1]
        defaultPort = dsnMatch[2]
      }
    }

    const publicHost = await input({ message: 'Enter public PostgreSQL host:', default: defaultHost })
    const publicPort = await input({ message: 'Enter public PostgreSQL port:', default: defaultPort })
    const pgUser = await input({ message: 'Enter PostgreSQL admin username:', default: 'admin' })
    const pgPassword = await password({ message: 'Enter PostgreSQL admin password:' })
    const pgDatabase = await input({ message: 'Enter PostgreSQL database name:', default: 'postgres' })

    return [publicHost, publicPort, pgUser, pgPassword, pgDatabase]
  }

  private async createConnection(host: string, port: string, user: string, password: string, database: string): Promise<pg.Client> {
    const conn = new pg.Client({
      host,
      port: parseInt(port),
      user,
      password,
      database,
      ssl: {
        rejectUnauthorized: false // Note: This is not secure for production use
      }
    })

    await conn.connect()
    return conn
  }
}