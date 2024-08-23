#!/bin/bash

# Define the source directory if the files are located in a specific directory, else use the current directory.
SOURCE_DIR="."

# Function to copy a file if it exists
copy_file_if_exists() {
    local file_name="$1"
    local target_dir="$2"

    if [[ -f "$SOURCE_DIR/$file_name" ]]; then
        cp "$SOURCE_DIR/$file_name" "$target_dir"
        echo "Copied $file_name to $target_dir"
    else
        echo "File $file_name does not exist, skipping."
    fi
}

# Copy files to their respective directories
copy_file_if_exists "balance-checker-config.json" "./balance-checker/configs/"
copy_file_if_exists "bridge-history-config.json" "./bridge-history-api/configs/"
copy_file_if_exists "bridge-history-config.json" "./bridge-history-fetcher/configs/"
copy_file_if_exists "chain-monitor-config.json" "./chain-monitor/configs/"
copy_file_if_exists "coordinator-config.json" "./coordinator-api/configs/"
copy_file_if_exists "coordinator-config.json" "./coordinator-cron/configs/"
copy_file_if_exists "frontend-config" "./frontends/configs/"
copy_file_if_exists "genesis.json" "./scroll-common/configs/"
copy_file_if_exists "rollup-config.json" "./gas-oracle/configs/"
copy_file_if_exists "rollup-config.json" "./rollup-node/configs/"
copy_file_if_exists "rollup-explorer-backend-config.json" "./rollup-explorer-backend/configs/"

# Print a final message
echo "File copy operation completed."