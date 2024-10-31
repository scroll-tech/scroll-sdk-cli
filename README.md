# Scroll SDK CLI
[![Twitter Follow](https://img.shields.io/twitter/follow/Scroll_ZKP?style=social)](https://twitter.com/Scroll_ZKP)
[![Discord](https://img.shields.io/discord/984015101017346058?color=%235865F2&label=Discord&logo=discord&logoColor=%23fff)](https://discord.gg/scroll)

## Introduction

A tool for configuring, managing, and testing [Scroll SDK](https://docs.scroll.io/en/sdk/) deployments.

### Other Scroll SDK Repos

- [Scroll SDK](https://www.github.com/scroll-tech/scroll-sdk)
- [Scroll Proving SDK](https://www.github.com/scroll-tech/scroll-proving-sdk)


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
scroll-sdk-cli/0.0.16 linux-x64 node-v20.11.0
$ scrollsdk --help [COMMAND]
USAGE
  $ scrollsdk COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
- [Scroll SDK CLI](#scroll-sdk-cli)
  - [Introduction](#introduction)
    - [Other Scroll SDK Repos](#other-scroll-sdk-repos)
- [Usage](#usage)
- [Commands](#commands)
  - [`scrollsdk help [COMMAND]`](#scrollsdk-help-command)
  - [`scrollsdk helper activity`](#scrollsdk-helper-activity)
  - [`scrollsdk helper clear-accounts`](#scrollsdk-helper-clear-accounts)
  - [`scrollsdk helper derive-enode NODEKEY`](#scrollsdk-helper-derive-enode-nodekey)
  - [`scrollsdk helper fund-accounts`](#scrollsdk-helper-fund-accounts)
  - [`scrollsdk helper set-scalars`](#scrollsdk-helper-set-scalars)
  - [`scrollsdk plugins`](#scrollsdk-plugins)
  - [`scrollsdk plugins add PLUGIN`](#scrollsdk-plugins-add-plugin)
  - [`scrollsdk plugins:inspect PLUGIN...`](#scrollsdk-pluginsinspect-plugin)
  - [`scrollsdk plugins install PLUGIN`](#scrollsdk-plugins-install-plugin)
  - [`scrollsdk plugins link PATH`](#scrollsdk-plugins-link-path)
  - [`scrollsdk plugins remove [PLUGIN]`](#scrollsdk-plugins-remove-plugin)
  - [`scrollsdk plugins reset`](#scrollsdk-plugins-reset)
  - [`scrollsdk plugins uninstall [PLUGIN]`](#scrollsdk-plugins-uninstall-plugin)
  - [`scrollsdk plugins unlink [PLUGIN]`](#scrollsdk-plugins-unlink-plugin)
  - [`scrollsdk plugins update`](#scrollsdk-plugins-update)
  - [`scrollsdk setup configs`](#scrollsdk-setup-configs)
  - [`scrollsdk setup db-init`](#scrollsdk-setup-db-init)
  - [`scrollsdk setup domains [FILE]`](#scrollsdk-setup-domains-file)
  - [`scrollsdk setup gas-token`](#scrollsdk-setup-gas-token)
  - [`scrollsdk setup gen-keystore`](#scrollsdk-setup-gen-keystore)
  - [`scrollsdk setup prep-charts`](#scrollsdk-setup-prep-charts)
  - [`scrollsdk setup push-secrets`](#scrollsdk-setup-push-secrets)
  - [`scrollsdk setup tls`](#scrollsdk-setup-tls)
  - [`scrollsdk test contracts`](#scrollsdk-test-contracts)
  - [`scrollsdk test dependencies`](#scrollsdk-test-dependencies)
  - [`scrollsdk test e2e`](#scrollsdk-test-e2e)
  - [`scrollsdk test ingress`](#scrollsdk-test-ingress)

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
  $ scrollsdk helper activity [-c <value>] [-i <value>] [-o] [-t] [-p] [-k <value>] [-x <value>] [-r <value>] [-d]

FLAGS
  -c, --config=<value>      [default: ./config.toml] Path to config.toml file
  -d, --debug               Enable debug mode for more detailed logging
  -i, --interval=<value>    [default: 3] Interval between transactions in seconds
  -k, --privateKey=<value>  Private key (overrides config)
  -o, --layer1              Generate activity on Layer 1
  -p, --pod                 Run inside Kubernetes pod
  -r, --rpc=<value>         RPC URL (overrides config for both layers)
  -t, --[no-]layer2         Generate activity on Layer 2
  -x, --recipient=<value>   Recipient address (overrides config)

DESCRIPTION
  Generate transactions on the specified network(s) to produce more blocks
```

_See code: [src/commands/helper/activity.ts](https://github.com/scroll-tech/scroll-sdk-cli/blob/v0.0.16/src/commands/helper/activity.ts)_

## `scrollsdk helper clear-accounts`

Clear pending transactions and optionally transfer remaining funds on Layer 2

```
USAGE
  $ scrollsdk helper clear-accounts [-k <value>] [-m <value>] [-a <value>] [-x <value>] [-r <value>] [-c <value>] [-p]
  [-d]

FLAGS
  -a, --accounts=<value>    [default: 10] Number of accounts to generate from mnemonic
  -c, --config=<value>      [default: ./config.toml] Path to config.toml file
  -d, --debug               Run in debug mode
  -k, --privateKey=<value>  Private key to clear pending transactions
  -m, --mnemonic=<value>    Mnemonic to generate wallets
  -p, --pod                 Run in pod mode
  -r, --rpc=<value>         Layer 2 RPC URL
  -x, --recipient=<value>   Recipient address for remaining funds

DESCRIPTION
  Clear pending transactions and optionally transfer remaining funds on Layer 2
```

_See code: [src/commands/helper/clear-accounts.ts](https://github.com/scroll-tech/scroll-sdk-cli/blob/v0.0.16/src/commands/helper/clear-accounts.ts)_

## `scrollsdk helper derive-enode NODEKEY`

Derive enode and L2_GETH_STATIC_PEERS from a nodekey

```
USAGE
  $ scrollsdk helper derive-enode NODEKEY

ARGUMENTS
  NODEKEY  Nodekey of the geth ethereum node

DESCRIPTION
  Derive enode and L2_GETH_STATIC_PEERS from a nodekey

EXAMPLES
  $ scrollsdk helper derive-enode 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
```

_See code: [src/commands/helper/derive-enode.ts](https://github.com/scroll-tech/scroll-sdk-cli/blob/v0.0.16/src/commands/helper/derive-enode.ts)_

## `scrollsdk helper fund-accounts`

Fund L1 and L2 accounts for contracts

```
USAGE
  $ scrollsdk helper fund-accounts [-a <value>] [-c <value>] [-n <value>] [-d] [-o <value>] [-t <value>] [-m] [-p] [-k
    <value>] [-i] [-f <value>] [-l 1|2]

FLAGS
  -a, --account=<value>      Additional account to fund
  -c, --config=<value>       [default: ./config.toml] Path to config.toml file
  -d, --dev                  Use Anvil devnet funding logic
  -f, --amount=<value>       [default: 0.1] Amount to fund in ETH
  -i, --fund-deployer        Fund the deployer address only
  -k, --private-key=<value>  Private key for funder wallet
  -l, --layer=<option>       Specify layer to fund (1 for L1, 2 for L2)
                             <options: 1|2>
  -m, --manual               Manually fund the accounts
  -n, --contracts=<value>    [default: ./config-contracts.toml] Path to configs-contracts.toml file
  -o, --l1rpc=<value>        L1 RPC URL
  -p, --pod                  Run inside Kubernetes pod
  -t, --l2rpc=<value>        L2 RPC URL

DESCRIPTION
  Fund L1 and L2 accounts for contracts
```

_See code: [src/commands/helper/fund-accounts.ts](https://github.com/scroll-tech/scroll-sdk-cli/blob/v0.0.16/src/commands/helper/fund-accounts.ts)_

## `scrollsdk helper set-scalars`

Set commit and blob scalars for Scroll SDK

```
USAGE
  $ scrollsdk helper set-scalars [-c <value>] [-n <value>] [-p] [-k <value>] [--blobScalar <value>] [--commitScalar
    <value>] [-r <value>]

FLAGS
  -c, --config=<value>        [default: ./config.toml] Path to config.toml file
  -k, --k=<value>             Private key of the Owner
  -n, --contracts=<value>     [default: ./config-contracts.toml] Path to configs-contracts.toml file
  -p, --pod                   Run inside Kubernetes pod
  -r, --rpc=<value>           RPC URL (overrides config)
      --blobScalar=<value>    Value for setBlobScalar
      --commitScalar=<value>  Value for setCommitScalar

DESCRIPTION
  Set commit and blob scalars for Scroll SDK
```

_See code: [src/commands/helper/set-scalars.ts](https://github.com/scroll-tech/scroll-sdk-cli/blob/v0.0.16/src/commands/helper/set-scalars.ts)_

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

## `scrollsdk setup configs`

Generate configuration files and create environment files for services

```
USAGE
  $ scrollsdk setup configs [--image-tag <value>] [--configs-dir <value>]

FLAGS
  --configs-dir=<value>  [default: values] Directory to store configuration files
  --image-tag=<value>    Specify the Docker image tag to use

DESCRIPTION
  Generate configuration files and create environment files for services

EXAMPLES
  $ scrollsdk setup configs

  $ scrollsdk setup configs --image-tag gen-configs-2eba3d2c418b16f4a66d9baadeb1c1bafdca81b1

  $ scrollsdk setup configs --configs-dir custom-configs
```

_See code: [src/commands/setup/configs.ts](https://github.com/scroll-tech/scroll-sdk-cli/blob/v0.0.16/src/commands/setup/configs.ts)_

## `scrollsdk setup db-init`

Initialize databases with new users and passwords interactively or update permissions

```
USAGE
  $ scrollsdk setup db-init [-u] [-d] [-c] [--update-port <value>]

FLAGS
  -c, --clean                Delete existing database and user before creating new ones
  -d, --debug                Show debug output including SQL queries
  -u, --update-permissions   Update permissions for existing users
      --update-port=<value>  Update the port of current database values

DESCRIPTION
  Initialize databases with new users and passwords interactively or update permissions

EXAMPLES
  $ scrollsdk setup db-init

  $ scrollsdk setup db-init --update-permissions

  $ scrollsdk setup db-init --update-permissions --debug

  $ scrollsdk setup db-init --clean

  $ scrollsdk setup db-init --update-db-port=25061
```

_See code: [src/commands/setup/db-init.ts](https://github.com/scroll-tech/scroll-sdk-cli/blob/v0.0.16/src/commands/setup/db-init.ts)_

## `scrollsdk setup domains [FILE]`

Set up domain configurations for external services

```
USAGE
  $ scrollsdk setup domains [FILE] [-f] [-n <value>]

ARGUMENTS
  FILE  file to read

FLAGS
  -f, --force
  -n, --name=<value>  name to print

DESCRIPTION
  Set up domain configurations for external services

EXAMPLES
  $ scrollsdk setup domains
```

_See code: [src/commands/setup/domains.ts](https://github.com/scroll-tech/scroll-sdk-cli/blob/v0.0.16/src/commands/setup/domains.ts)_

## `scrollsdk setup gas-token`

Set up gas token configurations

```
USAGE
  $ scrollsdk setup gas-token

DESCRIPTION
  Set up gas token configurations

EXAMPLES
  $ scrollsdk setup gas-token
```

_See code: [src/commands/setup/gas-token.ts](https://github.com/scroll-tech/scroll-sdk-cli/blob/v0.0.16/src/commands/setup/gas-token.ts)_

## `scrollsdk setup gen-keystore`

Generate keystore and account keys for L2 Geth

```
USAGE
  $ scrollsdk setup gen-keystore [--accounts]

FLAGS
  --[no-]accounts  Generate account key pairs

DESCRIPTION
  Generate keystore and account keys for L2 Geth

EXAMPLES
  $ scrollsdk setup gen-keystore

  $ scrollsdk setup gen-keystore --no-accounts
```

_See code: [src/commands/setup/gen-keystore.ts](https://github.com/scroll-tech/scroll-sdk-cli/blob/v0.0.16/src/commands/setup/gen-keystore.ts)_

## `scrollsdk setup prep-charts`

Validate Makefile and prepare Helm charts for Scroll SDK

```
USAGE
  $ scrollsdk setup prep-charts [--github-username <value>] [--github-token <value>] [--values-dir <value>]
    [--skip-auth-check]

FLAGS
  --github-token=<value>     GitHub Personal Access Token
  --github-username=<value>  GitHub username
  --skip-auth-check          Skip authentication check for individual charts
  --values-dir=<value>       [default: ./values] Directory containing values files

DESCRIPTION
  Validate Makefile and prepare Helm charts for Scroll SDK

EXAMPLES
  $ scrollsdk setup prep-charts

  $ scrollsdk setup prep-charts --github-username=your-username --github-token=your-token

  $ scrollsdk setup prep-charts --values-dir=./custom-values

  $ scrollsdk setup prep-charts --skip-auth-check
```

_See code: [src/commands/setup/prep-charts.ts](https://github.com/scroll-tech/scroll-sdk-cli/blob/v0.0.16/src/commands/setup/prep-charts.ts)_

## `scrollsdk setup push-secrets`

Push secrets to the selected secret service

```
USAGE
  $ scrollsdk setup push-secrets [-d] [--values-dir <value>]

FLAGS
  -d, --debug               Show debug output
      --values-dir=<value>  [default: values] Directory containing the values files

DESCRIPTION
  Push secrets to the selected secret service

EXAMPLES
  $ scrollsdk setup push-secrets

  $ scrollsdk setup push-secrets --debug

  $ scrollsdk setup push-secrets --values-dir custom-values
```

_See code: [src/commands/setup/push-secrets.ts](https://github.com/scroll-tech/scroll-sdk-cli/blob/v0.0.16/src/commands/setup/push-secrets.ts)_

## `scrollsdk setup tls`

Update TLS configuration in Helm charts

```
USAGE
  $ scrollsdk setup tls [-d] [--values-dir <value>]

FLAGS
  -d, --debug               Show debug output and confirm before making changes
      --values-dir=<value>  [default: values] Directory containing the values files

DESCRIPTION
  Update TLS configuration in Helm charts

EXAMPLES
  $ scrollsdk setup tls

  $ scrollsdk setup tls --debug

  $ scrollsdk setup tls --values-dir custom-values
```

_See code: [src/commands/setup/tls.ts](https://github.com/scroll-tech/scroll-sdk-cli/blob/v0.0.16/src/commands/setup/tls.ts)_

## `scrollsdk test contracts`

Test contracts by checking deployment and initialization

```
USAGE
  $ scrollsdk test contracts [-c <value>] [-n <value>] [-p]

FLAGS
  -c, --config=<value>     [default: ./config.toml] Path to config.toml file
  -n, --contracts=<value>  [default: ./config-contracts.toml] Path to configs-contracts.toml file
  -p, --pod                Run inside Kubernetes pod

DESCRIPTION
  Test contracts by checking deployment and initialization
```

_See code: [src/commands/test/contracts.ts](https://github.com/scroll-tech/scroll-sdk-cli/blob/v0.0.16/src/commands/test/contracts.ts)_

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

_See code: [src/commands/test/dependencies.ts](https://github.com/scroll-tech/scroll-sdk-cli/blob/v0.0.16/src/commands/test/dependencies.ts)_

## `scrollsdk test e2e`

Test contracts by checking deployment and initialization

```
USAGE
  $ scrollsdk test e2e [-c <value>] [-n <value>] [-m] [-p] [-k <value>] [-r] [-s]

FLAGS
  -c, --config=<value>          [default: ./config.toml] Path to config.toml file
  -k, --private-key=<value>     Private key for funder wallet initialization
  -m, --manual                  Manually fund the test wallet.
  -n, --contracts=<value>       [default: ./config-contracts.toml] Path to configs-contracts.toml file
  -p, --pod                     Run inside Kubernetes pod
  -r, --resume                  Uses e2e_resume.json to continue last run.
  -s, --skip-wallet-generation  Manually fund the test wallet.

DESCRIPTION
  Test contracts by checking deployment and initialization
```

_See code: [src/commands/test/e2e.ts](https://github.com/scroll-tech/scroll-sdk-cli/blob/v0.0.16/src/commands/test/e2e.ts)_

## `scrollsdk test ingress`

Check for required ingress hosts and validate frontend URLs

```
USAGE
  $ scrollsdk test ingress [-c <value>] [-d] [-n <value>]

FLAGS
  -c, --config=<value>     Path to config.toml file
  -d, --dev                Include development ingresses
  -n, --namespace=<value>  [default: default] Kubernetes namespace

DESCRIPTION
  Check for required ingress hosts and validate frontend URLs
```

_See code: [src/commands/test/ingress.ts](https://github.com/scroll-tech/scroll-sdk-cli/blob/v0.0.16/src/commands/test/ingress.ts)_
<!-- commandsstop -->
