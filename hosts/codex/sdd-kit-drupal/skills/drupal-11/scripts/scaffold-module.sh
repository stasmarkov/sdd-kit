#!/usr/bin/env bash
set -euo pipefail

# Drupal Module Scaffolding Script
# Usage: ./scaffold-module.sh <module_name> [module_path]
# Example: ./scaffold-module.sh my_custom_module web/modules/custom

MODULE_NAME="${1:?Usage: scaffold-module.sh <module_name> [module_path]}"
MODULE_PATH="${2:-web/modules/custom}"

MODULE_DIR="${MODULE_PATH}/${MODULE_NAME}"

if [ -d "$MODULE_DIR" ]; then
  echo "Error: Module directory already exists: $MODULE_DIR"
  exit 1
fi

echo "Creating module: ${MODULE_NAME} at ${MODULE_DIR}"

# Create directory structure
mkdir -p "${MODULE_DIR}/src/Controller"
mkdir -p "${MODULE_DIR}/src/Entity"
mkdir -p "${MODULE_DIR}/src/Form"
mkdir -p "${MODULE_DIR}/src/Plugin/Block"
mkdir -p "${MODULE_DIR}/src/Service"
mkdir -p "${MODULE_DIR}/src/EventSubscriber"
mkdir -p "${MODULE_DIR}/config/install"
mkdir -p "${MODULE_DIR}/config/schema"
mkdir -p "${MODULE_DIR}/templates"
mkdir -p "${MODULE_DIR}/tests/src/Unit"
mkdir -p "${MODULE_DIR}/tests/src/Kernel"
mkdir -p "${MODULE_DIR}/tests/src/Functional"

# Create info file
cat > "${MODULE_DIR}/${MODULE_NAME}.info.yml" << EOF
name: '${MODULE_NAME}'
type: module
description: 'Custom module.'
core_version_requirement: ^11
package: Custom
EOF

# Create empty module file
cat > "${MODULE_DIR}/${MODULE_NAME}.module" << 'EOF'
<?php

/**
 * @file
 * Primary module hooks.
 */

declare(strict_types=1);
EOF

# Create services file
cat > "${MODULE_DIR}/${MODULE_NAME}.services.yml" << EOF
services: {}
EOF

echo "Module scaffolded at: ${MODULE_DIR}"
echo ""
echo "Next steps:"
echo "  drush en ${MODULE_NAME}    # Enable the module"
echo "  drush cr                    # Clear cache"
