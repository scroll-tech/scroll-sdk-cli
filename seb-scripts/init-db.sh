#!/bin/bash
# Define database name
PG_HOST=$1
PG_PORT=$2
PG_USER=$3
export PGPASSWORD=$4
POSTGRES_DB=$5
DB_NAME="$POSTGRES_DB"
DB_USER=$6
DB_PASSWORD=$7


# Check if the database exists
DB_EXISTS=$(psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME" && echo "true" || echo "false")

# If the database does not exist, create it
if [ "$DB_EXISTS" == "false" ]; then
  echo "Creating database $DB_NAME..."
  createdb -h $PG_HOST -p $PG_PORT -U $PG_USER $DB_NAME
  echo "Database $DB_NAME created successfully."
else
  echo "Database $DB_NAME already exists."
fi

# Check if the user exists
USER_EXISTS=$(psql -h $PG_HOST -p $PG_PORT -U $PG_USER -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 && echo "true" || echo "false")

# If the user does not exist, create it
if [ "$USER_EXISTS" == "false" ]; then
echo "Creating user $DB_USER..."
psql -h $PG_HOST -p $PG_PORT -U $PG_USER -c "CREATE USER \"$DB_USER\" WITH PASSWORD '$DB_PASSWORD';"
echo "User $DB_USER created successfully."
else
echo "User $DB_USER already exists."
fi

# Add permission
psql -h $PG_HOST -p $PG_PORT -U $PG_USER -d $POSTGRES_DB -c "grant connect, create on database $POSTGRES_DB to $DB_USER;"
psql -h $PG_HOST -p $PG_PORT -U $PG_USER -d $POSTGRES_DB -c "grant all privileges on schema public to $DB_USER;"
psql -h $PG_HOST -p $PG_PORT -U $PG_USER -d $POSTGRES_DB -c "grant usage, select, update, insert on all tables in schema public to $DB_USER;"
psql -h $PG_HOST -p $PG_PORT -U $PG_USER -d $POSTGRES_DB -c "GRANT CREATE ON SCHEMA public TO $DB_USER;"
psql -h $PG_HOST -p $PG_PORT -U $PG_USER -d $POSTGRES_DB -c "alter default privileges in schema public grant select, update, insert on tables to $DB_USER;"
psql -h $PG_HOST -p $PG_PORT -U $PG_USER -d $POSTGRES_DB -c "grant usage, select on all sequences in schema public to $DB_USER;"
psql -h $PG_HOST -p $PG_PORT -U $PG_USER -d $POSTGRES_DB -c "alter default privileges in schema public grant usage, select on sequences to $DB_USER;"