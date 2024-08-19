scroll-sdk-cli
=================

A tool for managing and testing Scroll SDK deployments


[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/scroll-sdk-cli.svg)](https://npmjs.org/package/scroll-sdk-cli)
[![Downloads/week](https://img.shields.io/npm/dw/scroll-sdk-cli.svg)](https://npmjs.org/package/scroll-sdk-cli)


<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g scroll-sdk-cli
$ scrollsdk COMMAND
running command...
$ scrollsdk (--version)
scroll-sdk-cli/0.0.1 linux-x64 node-v20.11.0
$ scrollsdk --help [COMMAND]
USAGE
  $ scrollsdk COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`scrollsdk hello PERSON`](#scrollsdk-hello-person)
* [`scrollsdk hello world`](#scrollsdk-hello-world)
* [`scrollsdk help [COMMAND]`](#scrollsdk-help-command)
* [`scrollsdk helper activity`](#scrollsdk-helper-activity)
* [`scrollsdk helper fund-devnet`](#scrollsdk-helper-fund-devnet)
* [`scrollsdk plugins`](#scrollsdk-plugins)
* [`scrollsdk plugins add PLUGIN`](#scrollsdk-plugins-add-plugin)
* [`scrollsdk plugins:inspect PLUGIN...`](#scrollsdk-pluginsinspect-plugin)
* [`scrollsdk plugins install PLUGIN`](#scrollsdk-plugins-install-plugin)
* [`scrollsdk plugins link PATH`](#scrollsdk-plugins-link-path)
* [`scrollsdk plugins remove [PLUGIN]`](#scrollsdk-plugins-remove-plugin)
* [`scrollsdk plugins reset`](#scrollsdk-plugins-reset)
* [`scrollsdk plugins uninstall [PLUGIN]`](#scrollsdk-plugins-uninstall-plugin)
* [`scrollsdk plugins unlink [PLUGIN]`](#scrollsdk-plugins-unlink-plugin)
* [`scrollsdk plugins update`](#scrollsdk-plugins-update)
* [`scrollsdk test contracts`](#scrollsdk-test-contracts)
* [`scrollsdk test dependencies`](#scrollsdk-test-dependencies)
* [`scrollsdk test e2e`](#scrollsdk-test-e2e)
* [`scrollsdk test ingress`](#scrollsdk-test-ingress)

## `scrollsdk hello PERSON`

Say hello

```
USAGE
  $ scrollsdk hello PERSON -f <value>

ARGUMENTS
  PERSON  Person to say hello to

FLAGS
  -f, --from=<value>  (required) Who is saying hello

DESCRIPTION
  Say hello

EXAMPLES
  $ scrollsdk hello friend --from oclif
  hello friend from oclif! (./src/commands/hello/index.ts)
```

_See code: [src/commands/hello/index.ts](https://github.com/scroll-tech/scroll-sdk-cli/blob/v0.0.1/src/commands/hello/index.ts)_

## `scrollsdk hello world`

Say hello world

```
USAGE
  $ scrollsdk hello world

DESCRIPTION
  Say hello world

EXAMPLES
  $ scrollsdk hello world
  hello world! (./src/commands/hello/world.ts)
```

_See code: [src/commands/hello/world.ts](https://github.com/scroll-tech/scroll-sdk-cli/blob/v0.0.1/src/commands/hello/world.ts)_

## `scrollsdk help [COMMAND]`

Display help for scrollsdk.

```
USAGE
  $ scrollsdk help [COMMAND...] [-n]

ARGUMENTS
  COMMAND...  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for scrollsdk.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v6.2.8/src/commands/help.ts)_

## `scrollsdk helper activity`

Generate transactions on the specified network(s) to produce more blocks

```
USAGE
  $ scrollsdk helper activity [-c <value>] [-i <value>] [-o] [-t] [-p] [-k <value>] [-x <value>] [-r <value>]

FLAGS
  -c, --config=<value>      [default: ./config.toml] Path to config.toml file
  -i, --interval=<value>    [default: 5] Interval between transactions in seconds
  -k, --privateKey=<value>  Private key (overrides config)
  -o, --layer1              Generate activity on Layer 1
  -p, --pod                 Run inside Kubernetes pod
  -r, --rpc=<value>         RPC URL (overrides config for both layers)
  -t, --[no-]layer2         Generate activity on Layer 2
  -x, --recipient=<value>   Recipient address (overrides config)

DESCRIPTION
  Generate transactions on the specified network(s) to produce more blocks
```

_See code: [src/commands/helper/activity.ts](https://github.com/scroll-tech/scroll-sdk-cli/blob/v0.0.1/src/commands/helper/activity.ts)_

## `scrollsdk helper fund-devnet`

Fund default L1 accounts when using an Anvil devnet

```
USAGE
  $ scrollsdk helper fund-devnet [-a <value>] [-c <value>] [-r <value>]

FLAGS
  -a, --account=<value>  Additional account to fund
  -c, --config=<value>   [default: ./config.toml] Path to config.toml file
  -r, --rpc=<value>      L1 RPC URL

DESCRIPTION
  Fund default L1 accounts when using an Anvil devnet
```

_See code: [src/commands/helper/fund-devnet.ts](https://github.com/scroll-tech/scroll-sdk-cli/blob/v0.0.1/src/commands/helper/fund-devnet.ts)_

## `scrollsdk plugins`

List installed plugins.

```
USAGE
  $ scrollsdk plugins [--json] [--core]

FLAGS
  --core  Show core plugins.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ scrollsdk plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.4/src/commands/plugins/index.ts)_

## `scrollsdk plugins add PLUGIN`

Installs a plugin into scrollsdk.

```
USAGE
  $ scrollsdk plugins add PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into scrollsdk.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the SCROLLSDK_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the SCROLLSDK_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ scrollsdk plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ scrollsdk plugins add myplugin

  Install a plugin from a github url.

    $ scrollsdk plugins add https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ scrollsdk plugins add someuser/someplugin
```

## `scrollsdk plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ scrollsdk plugins inspect PLUGIN...

ARGUMENTS
  PLUGIN...  [default: .] Plugin to inspect.

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Displays installation properties of a plugin.

EXAMPLES
  $ scrollsdk plugins inspect myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.4/src/commands/plugins/inspect.ts)_

## `scrollsdk plugins install PLUGIN`

Installs a plugin into scrollsdk.

```
USAGE
  $ scrollsdk plugins install PLUGIN... [--json] [-f] [-h] [-s | -v]

ARGUMENTS
  PLUGIN...  Plugin to install.

FLAGS
  -f, --force    Force npm to fetch remote resources even if a local copy exists on disk.
  -h, --help     Show CLI help.
  -s, --silent   Silences npm output.
  -v, --verbose  Show verbose npm output.

GLOBAL FLAGS
  --json  Format output as json.

DESCRIPTION
  Installs a plugin into scrollsdk.

  Uses npm to install plugins.

  Installation of a user-installed plugin will override a core plugin.

  Use the SCROLLSDK_NPM_LOG_LEVEL environment variable to set the npm loglevel.
  Use the SCROLLSDK_NPM_REGISTRY environment variable to set the npm registry.

ALIASES
  $ scrollsdk plugins add

EXAMPLES
  Install a plugin from npm registry.

    $ scrollsdk plugins install myplugin

  Install a plugin from a github url.

    $ scrollsdk plugins install https://github.com/someuser/someplugin

  Install a plugin from a github slug.

    $ scrollsdk plugins install someuser/someplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.4/src/commands/plugins/install.ts)_

## `scrollsdk plugins link PATH`

Links a plugin into the CLI for development.

```
USAGE
  $ scrollsdk plugins link PATH [-h] [--install] [-v]

ARGUMENTS
  PATH  [default: .] path to plugin

FLAGS
  -h, --help          Show CLI help.
  -v, --verbose
      --[no-]install  Install dependencies after linking the plugin.

DESCRIPTION
  Links a plugin into the CLI for development.
  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello'
  command will override the user-installed or core plugin implementation. This is useful for development work.


EXAMPLES
  $ scrollsdk plugins link myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.4/src/commands/plugins/link.ts)_

## `scrollsdk plugins remove [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ scrollsdk plugins remove [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ scrollsdk plugins unlink
  $ scrollsdk plugins remove

EXAMPLES
  $ scrollsdk plugins remove myplugin
```

## `scrollsdk plugins reset`

Remove all user-installed and linked plugins.

```
USAGE
  $ scrollsdk plugins reset [--hard] [--reinstall]

FLAGS
  --hard       Delete node_modules and package manager related files in addition to uninstalling plugins.
  --reinstall  Reinstall all plugins after uninstalling.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.4/src/commands/plugins/reset.ts)_

## `scrollsdk plugins uninstall [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ scrollsdk plugins uninstall [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ scrollsdk plugins unlink
  $ scrollsdk plugins remove

EXAMPLES
  $ scrollsdk plugins uninstall myplugin
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.4/src/commands/plugins/uninstall.ts)_

## `scrollsdk plugins unlink [PLUGIN]`

Removes a plugin from the CLI.

```
USAGE
  $ scrollsdk plugins unlink [PLUGIN...] [-h] [-v]

ARGUMENTS
  PLUGIN...  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ scrollsdk plugins unlink
  $ scrollsdk plugins remove

EXAMPLES
  $ scrollsdk plugins unlink myplugin
```

## `scrollsdk plugins update`

Update installed plugins.

```
USAGE
  $ scrollsdk plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v5.4.4/src/commands/plugins/update.ts)_

## `scrollsdk test contracts`

Test contracts by checking deployment and initialization

```
USAGE
  $ scrollsdk test contracts [-c <value>] [-t <value>] [-p]

FLAGS
  -c, --config=<value>     [default: ./config.toml] Path to config.toml file
  -p, --pod                Run inside Kubernetes pod
  -t, --contracts=<value>  [default: ./config-contracts.toml] Path to configs-contracts.toml file

DESCRIPTION
  Test contracts by checking deployment and initialization
```

_See code: [src/commands/test/contracts.ts](https://github.com/scroll-tech/scroll-sdk-cli/blob/v0.0.1/src/commands/test/contracts.ts)_

## `scrollsdk test dependencies`

Check for required dependencies

```
USAGE
  $ scrollsdk test dependencies [-d]

FLAGS
  -d, --dev  Include development dependencies

DESCRIPTION
  Check for required dependencies
```

_See code: [src/commands/test/dependencies.ts](https://github.com/scroll-tech/scroll-sdk-cli/blob/v0.0.1/src/commands/test/dependencies.ts)_

## `scrollsdk test e2e`

Test contracts by checking deployment and initialization

```
USAGE
  $ scrollsdk test e2e [-c <value>] [-t <value>] [-m] [-p] [-k <value>] [-r] [-s]

FLAGS
  -c, --config=<value>          [default: ./config.toml] Path to config.toml file
  -k, --private_key=<value>     Private key for funder wallet initialization
  -m, --manual_fund             Manually fund the test wallet.
  -p, --pod                     Run inside Kubernetes pod
  -r, --resume                  Uses e2e_resume.json to continue last run.
  -s, --skip_wallet_generation  Manually fund the test wallet.
  -t, --contracts=<value>       [default: ./config-contracts.toml] Path to configs-contracts.toml file

DESCRIPTION
  Test contracts by checking deployment and initialization
```

_See code: [src/commands/test/e2e.ts](https://github.com/scroll-tech/scroll-sdk-cli/blob/v0.0.1/src/commands/test/e2e.ts)_

## `scrollsdk test ingress`

Check for required ingress hosts

```
USAGE
  $ scrollsdk test ingress [-c <value>] [-d] [-n <value>]

FLAGS
  -c, --config=<value>     Path to config.toml file
  -d, --dev                Include development ingresses
  -n, --namespace=<value>  [default: default] Kubernetes namespace

DESCRIPTION
  Check for required ingress hosts
```

_See code: [src/commands/test/ingress.ts](https://github.com/scroll-tech/scroll-sdk-cli/blob/v0.0.1/src/commands/test/ingress.ts)_
<!-- commandsstop -->
