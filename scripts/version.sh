#!/bin/bash
set -euo pipefail

PACKAGE_NAME=$1
NPM_RELEASE_TYPE=${2-"prerelease"}

# Get full branch name excluding refs/head from the env var SOURCE_BRANCH
SOURCE_BRANCH_NAME=${SOURCE_BRANCH/refs\/heads\/}

# Configure git to commit as Azure Dev Ops
git config --local user.email "Azure Pipelines"
git config --local user.name "azuredevops@microsoft.com"

git pull origin ${SOURCE_BRANCH_NAME}
git checkout ${SOURCE_BRANCH_NAME}
echo Checked out branch: ${SOURCE_BRANCH_NAME}

# Make sure we have a clean working directory
git reset --hard

NPM_VERSION=`npm version ${NPM_RELEASE_TYPE} -m "Bumping NPM package ${PACKAGE_NAME} prerelease to version %s ***NO_CI***"`
echo Set NPM version to: ${NPM_VERSION}

# Since there isn't a package.json at the root of repo
# and we have multiple packages within same repo
# we need to manually commit and tag in order to create unique tag names
SHA=`git rev-parse HEAD`

git push origin ${SOURCE_BRANCH_NAME} --tags

echo Pushed new tag: ${PACKAGE_NAME}-${NPM_VERSION} @ SHA: ${SHA:0:8}
