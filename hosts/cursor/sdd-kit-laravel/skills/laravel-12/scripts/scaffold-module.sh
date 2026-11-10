#!/bin/bash
#
# Laravel Module Scaffolding Script
# Creates a complete modular monolith module structure
#
# Usage: ./scaffold-module.sh <Domain> <SubModule> <Entity>
# Example: ./scaffold-module.sh Payments Checkout Order

set -e

DOMAIN=$1
SUBMODULE=$2
ENTITY=$3

if [ -z "$DOMAIN" ] || [ -z "$SUBMODULE" ] || [ -z "$ENTITY" ]; then
    echo "Usage: ./scaffold-module.sh <Domain> <SubModule> <Entity>"
    echo "Example: ./scaffold-module.sh Payments Checkout Order"
    exit 1
fi

BASE_PATH="Modules/${DOMAIN}/${SUBMODULE}"

echo "🚀 Scaffolding module: ${DOMAIN}/${SUBMODULE} with entity: ${ENTITY}"

# Create Application layer
mkdir -p "${BASE_PATH}/Application/Http/Controllers"
mkdir -p "${BASE_PATH}/Application/Http/Requests"
mkdir -p "${BASE_PATH}/Application/Http/Resources"

# Create Domain layer
mkdir -p "${BASE_PATH}/Domain/Contracts"
mkdir -p "${BASE_PATH}/Domain/DataTransferObjects"
mkdir -p "${BASE_PATH}/Domain/Enums"
mkdir -p "${BASE_PATH}/Domain/Events"
mkdir -p "${BASE_PATH}/Domain/Exceptions"
mkdir -p "${BASE_PATH}/Domain/Models"
mkdir -p "${BASE_PATH}/Domain/Policies"
mkdir -p "${BASE_PATH}/Domain/Services"

# Create Infrastructure layer
mkdir -p "${BASE_PATH}/Infrastructure/Database/Factories"
mkdir -p "${BASE_PATH}/Infrastructure/Database/Migrations"
mkdir -p "${BASE_PATH}/Infrastructure/Database/Seeders"
mkdir -p "${BASE_PATH}/Infrastructure/Repositories"
mkdir -p "${BASE_PATH}/Infrastructure/Routes"
mkdir -p "${BASE_PATH}/Infrastructure/Providers"

# Create Tests
mkdir -p "${BASE_PATH}/Tests/Feature"
mkdir -p "${BASE_PATH}/Tests/Unit"

echo "✅ Created directory structure"
echo ""
echo "📁 Module structure at ${BASE_PATH}:"
echo "   Application/Http/{Controllers,Requests,Resources}"
echo "   Domain/{Contracts,DTOs,Enums,Events,Exceptions,Models,Policies,Services}"
echo "   Infrastructure/{Database,Repositories,Routes,Providers}"
echo "   Tests/{Feature,Unit}"
echo ""
echo "📋 Next steps:"
echo "   1. Create ${ENTITY} model in Domain/Models/"
echo "   2. Create DTOs in Domain/DataTransferObjects/"
echo "   3. Create repository interface and implementation"
echo "   4. Create service class"
echo "   5. Create invokable controllers"
echo "   6. Create service provider and register it"
echo "   7. Create routes"
echo "   8. Write tests"
echo ""
echo "💡 Use templates from assets/templates/ as starting points"
