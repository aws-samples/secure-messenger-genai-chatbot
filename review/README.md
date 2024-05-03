# Security review notes

A loose collection of instructions and commands for code security review.

Use the tools listed here for an automated repository security review.

 - [cdk-nag](https://github.com/cdklabs/cdk-nag/)
 - [git-secrets](https://github.com/awslabs/git-secrets)
```shell
cd /path/to/my/repo
git secrets --install
git secrets --register-aws

git-defender --setup
```
 - [Semgrep (for JavaScript code)](https://github.com/semgrep/semgrep)
```shell
. ./.venv/bin/activate
pip install semgrep
semgrep login
semgrep ci
```
 - [npm audit](https://docs.npmjs.com/cli/v8/commands/npm-audit)
```shell
cd genai-advisor-bot
npm audit
```
 - [bandit (for Python code)](https://github.com/PyCQA/bandit)
```shell
bandit -c ./secure-messenger-genai-chatbot/review/bandit.yaml -r secure-messenger-genai-chatbot/
```
 - [pip-audit](https://pypi.org/project/pip-audit/)
```shell
pip-audit
```
 - [repolinter](https://github.com/todogroup/repolinter)
```shell
npm install -g repolinter
```
 - run repolinter:
```shell
repolinter lint ./secure-messenger-genai-chatbot -r <pathToRulkeSetFile>
```
