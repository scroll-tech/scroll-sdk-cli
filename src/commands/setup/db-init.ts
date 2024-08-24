import { Command } from '@oclif/core'
import { input, password, confirm } from '@inquirer/prompts'
import pg from 'pg';
import * as fs from 'fs'
import * as path from 'path'
import * as toml from '@iarna/toml'

export default class SetupDbInit extends Command {
  static override description = 'Initialize databases with new users and passwords interactively'

  static override examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  private conn: pg.Client | undefined;
  private publicHost: string = "";
  private publicPort: string = "";
  private vpcHost: string = "";
  private vpcPort: string = "";
  private pgUser: string = "";
  private pgPassword: string = "";
  private pgDatabase: string = "";

  private async initializeDatabase(conn: pg.Client, dbName: string, dbUser: string, dbPassword: string): Promise<void> {
    try {
      // Check if the database exists
      const dbExistsResult = await conn.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName])
      if (dbExistsResult.rows.length === 0) {
        this.log(`Creating database ${dbName}...`)
        await conn.query(`CREATE DATABASE ${dbName}`)
        this.log(`Database ${dbName} created successfully.`)
      } else {
        this.log(`Database ${dbName} already exists.`)
      }

      // Check if the user exists
      const userExistsResult = await conn.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [dbUser])
      if (userExistsResult.rows.length === 0) {
        this.log(`Creating user ${dbUser}...`)
        // Use string interpolation for the password, but be careful about SQL injection
        await conn.query(`CREATE USER ${dbUser} WITH PASSWORD '${dbPassword.replace(/'/g, "''")}'`)
        this.log(`User ${dbUser} created successfully.`)
      } else {
        this.log(`User ${dbUser} already exists.`)
      }

      // Add permissions
      await conn.query(`GRANT CONNECT, CREATE ON DATABASE ${dbName} TO ${dbUser}`)
      await conn.query(`GRANT ALL PRIVILEGES ON SCHEMA public TO ${dbUser}`)
      await conn.query(`GRANT USAGE, SELECT, UPDATE, INSERT ON ALL TABLES IN SCHEMA public TO ${dbUser}`)
      await conn.query(`GRANT CREATE ON SCHEMA public TO ${dbUser}`)
      await conn.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, UPDATE, INSERT ON TABLES TO ${dbUser}`)
      await conn.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${dbUser}`)
      await conn.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${dbUser}`)

      this.log(`Permissions granted to ${dbUser} on ${dbName}.`)
    } catch (error) {
      this.error(`Failed to initialize database: ${error}`)
    }
  }

  private async updateConfigFile(dsnMap: Record<string, string>): Promise<void> {
    const configPath = path.join(process.cwd(), 'config.toml')
    if (!fs.existsSync(configPath)) {
      this.log('config.toml not found in the current directory. Skipping update.')
      return
    }

    const configContent = fs.readFileSync(configPath, 'utf-8')
    const config = toml.parse(configContent)

    if (!config.db) {
      config.db = {}
    }

    const dsnConfigMapping: Record<string, string[]> = {
      'ROLLUP_NODE': ['SCROLL_DB_CONNECTION_STRING', 'GAS_ORACLE_DB_CONNECTION_STRING', 'ROLLUP_NODE_DB_CONNECTION_STRING', 'ROLLUP_EXPLORER_DB_CONNECTION_STRING'],
      'BRIDGE_HISTORY': ['BRIDGE_HISTORY_DB_CONNECTION_STRING'],
      'CHAIN_MONITOR': ['CHAIN_MONITOR_DB_CONNECTION_STRING']
    }

    for (const [user, dsn] of Object.entries(dsnMap)) {
      const configKeys = dsnConfigMapping[user] || []
      for (const key of configKeys) {
        (config.db as Record<string, string>)[key] = dsn
      }
    }

    fs.writeFileSync(configPath, toml.stringify(config as any))
    this.log('config.toml has been updated with the new database connection strings.')
  }

  public async run(): Promise<void> {
    const databases = [
      { name: 'scroll', user: 'CHAIN_MONITOR' },
      { name: 'scroll', user: 'ROLLUP_NODE' },
      { name: 'scroll', user: 'BRIDGE_HISTORY' },
    ]

    // let publicHost: string, publicPort: string, vpcHost: string, vpcPort: string, pgUser: string, pgPassword: string, pgDatabase: string;

    const dsnMap: Record<string, string> = {}

    try {


      for (const db of databases) {

        if (!this.conn) {
          // First iteration or if the user chose to connect to a different cluster
          [this.publicHost, this.publicPort, this.vpcHost, this.vpcPort, this.pgUser, this.pgPassword, this.pgDatabase] = await this.promptForConnectionDetails();
          this.conn = await this.createConnection(this.publicHost, this.publicPort, this.pgUser, this.pgPassword, this.pgDatabase);
        } else if (await confirm({ message: 'Do you want to connect to a different database cluster for this database?' })) {
          // User chose to connect to a different cluster
          await this.conn.end();
          [this.publicHost, this.publicPort, this.vpcHost, this.vpcPort, this.pgUser, this.pgPassword, this.pgDatabase] = await this.promptForConnectionDetails();
          this.conn = await this.createConnection(this.publicHost, this.publicPort, this.pgUser, this.pgPassword, this.pgDatabase);
        }

        this.log(`Setting up database: ${db.name} for user: ${db.user}`)

        const dbPassword = await password({ message: `Enter password for ${db.user}:` })
        await this.initializeDatabase(this.conn, db.name, db.user.toLowerCase(), dbPassword)

        const dsn = `postgres://${db.user.toLowerCase()}:${dbPassword}@${this.vpcHost}:${this.vpcPort}/${db.name}?sslmode=require`
        this.log(`DSN for ${db.user}:\n${dsn}`)

        dsnMap[db.user] = dsn
      }

      this.log('All databases initialized successfully.')

      const updateConfig = await confirm({ message: 'Do you want to update the config.toml file with the new DSNs?' })
      if (updateConfig) {
        await this.updateConfigFile(dsnMap)
      }
    } finally {
      if (this.conn) {
        await this.conn.end()
      }
    }
  }

  private async promptForConnectionDetails(): Promise<[string, string, string, string, string, string, string]> {
    const publicHost = await input({ message: 'Enter public PostgreSQL host:', default: 'localhost' })
    const publicPort = await input({ message: 'Enter public PostgreSQL port:', default: '5432' })
    const vpcHost = await input({ message: 'Enter VPC PostgreSQL host (for DSN):', default: 'localhost' })
    const vpcPort = await input({ message: 'Enter VPC PostgreSQL port (for DSN):', default: '5432' })
    const pgUser = await input({ message: 'Enter PostgreSQL admin username:', default: 'admin' })
    const pgPassword = await password({ message: 'Enter PostgreSQL admin password:' })
    const pgDatabase = await input({ message: 'Enter PostgreSQL database name:', default: 'postgres' })

    return [publicHost, publicPort, vpcHost, vpcPort, pgUser, pgPassword, pgDatabase]
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