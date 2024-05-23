#!/bin/bash

pip install -r requirementss.txt
pip install -r requirements_dev.txt
sudo apt update
sudo apt install -y jq

# Create directory for all the review output files
mkdir -p ./.review.out

# Semgrep checks
semgrep login
semgrep ci --metrics=off --use-git-ignore --output ./.review.out/semgrep.output

# Check JavaScript code
cd genai-advisor-bot || exit
npm i --package-lock-only
npm audit > ../.review.out/npm_audit.output
cd ..

# Check Python code
bandit -c ./review/bandit.yaml -r . > ./.review.out/bandit.output
pip-audit > ./.review.out/pip-audit-summary.output
pip-audit --format json --output ./.review.out/pip-audit.output
jq . ./.review.out/pip-audit.output > ./.review.out/pip-audit.output.json

# Check CDK code
region=$(aws ec2 describe-availability-zones --output text --query 'AvailabilityZones[0].[RegionName]')
export AWS_DEFAULT_REGION=$region
cdk synthesize --all
cp cdk.out/*NagReport.csv ./.review.out/

# Run repolinter
git clone https://github.com/todogroup/repolinter.git
cd repolinter/
npm install -g repolinter
repolinter --version
# delete node_modules, cdk.out, __pycache__ folders before running repolinter or do a got clone into a fresh directory
# run repolinter with the ruleset of your choice i.e.:
# node <path/to/repolinter>/bin/repolinter.js lint path/to/project -r path/to/amazon-ospo-ruleset.json
# repolinter lint ./secure-messenger-genai-chatbot -r <pathToRulkeSetFile>
