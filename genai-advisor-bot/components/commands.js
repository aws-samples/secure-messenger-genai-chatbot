class CommandInterpreter {

    constructor(chatbotClient) {
        this.chatbotClient = chatbotClient;
    }

    processCommand(cmdString, sessionId) {
        const regex = /^[`*]{0,2}\/\S+/;
        if (regex.test(cmdString)) {
            return this.command(cmdString, sessionId);
        }
        return false;
    }

    async command(cmdString, sessionId) {
        const validCommands = [
            ["/list-models", this.cmdListModels],
            ["/list-rag-workspaces", this.cmdListRagWorkspaces],
            ["/select-model", this.cmdSelectModel],
            ["/select-rag-workspace", this.cmdSelectRagWorkspace],
            ["/current-config", this.cmdShowCurrent]
        ];
        let cleanCmdStr = cmdString.trim();
        cleanCmdStr = cleanCmdStr.replace(/^[`*]+|[`*]+$/g, "");  // remove MarkDown formatting
        for (const [token, cmdFunc] of validCommands) {
            const start = cleanCmdStr.indexOf(token);
            if (start >= 0) {
                return await cmdFunc(cleanCmdStr.substring(start + token.length), sessionId);
            }
        }
        // if no valid command, respond with help text
        return this.cmdHelp();
    }

    cmdListModels = async () => {
        const models = await this.menuModels();
        return {
            message: " ",
            metaMessage: JSON.stringify(models)
        };
    }

    cmdListRagWorkspaces = async () => {
        const workspaces = await this.menuWorkspaces();
        return {
            message: " ",
            metaMessage: JSON.stringify(workspaces)
        };
    }

    cmdSelectModel = async (cmdString, sessionId) => {
        const models = await this.menuModels();
        const index = parseInt(cmdString.trim());
        if (index < 0 || index >= models.table.rows.length) {
            return {
                message: "invalid menu item selected: " + index,
                metaMessage: ""
            };
        }
        const selectedModel = models.providers[index].modelName;
        const provider = models.providers[index].provider;
        if (this.chatbotClient.config.modelName !== selectedModel ||
            this.chatbotClient.config.provider !== provider) {
            const resp = await this.chatbotClient.deleteSession(sessionId);
            console.log("chatbot session delete: " + JSON.stringify(resp.data.deleteSession));
        }
        this.chatbotClient.config.modelName = selectedModel;
        this.chatbotClient.config.provider = provider;
        return {
            message: "active large language model: **" + selectedModel + "**",
            metaMessage: ""
        };
    }

    cmdSelectRagWorkspace = async (cmdString, sessionId) => {
        const workspaces = await this.menuWorkspaces();
        const index = parseInt(cmdString.trim());
        if (index < 0 || index >= workspaces.table.rows.length) {
            return {
                message: "invalid menu item selected: " + index,
                metaMessage: ""
            };
        }
        const workspaceName = workspaces.workspaces[index].name;
        const workspaceId = workspaces.workspaces[index].id;
        if (this.chatbotClient.config.workspaceName !== workspaceName ||
            this.chatbotClient.config.workspaceId !== workspaceId) {
            const resp = await this.chatbotClient.deleteSession(sessionId);
            console.log("chatbot session delete: " + JSON.stringify(resp.data.deleteSession));
        }
        this.chatbotClient.config.workspaceName = workspaceName;
        this.chatbotClient.config.workspaceId = workspaceId;
        return {
            message: "active workspace: **" + (workspaceName === "" ? "none selected" : workspaceName) + "**",
            metaMessage: ""
        };
    }

    cmdShowCurrent = () => {
        return {
            message: "active large language model: **" + this.chatbotClient.config.modelName + "**\n" +
                "active workspace: **" + (this.chatbotClient.config.workspaceName === "" ? "none selected" : this.chatbotClient.config.workspaceName) + "**",
            metaMessage: ""
        };
    }

    cmdHelp = () => {
        return {
            message: "You can use the following commands:\n\n" +
                "`/list-models` - list available large language models\n" +
                "`/list-rag-workspaces` - list available RAG workspaces\n" +
                "`/current-config` - show current configuration",
            metaMessage: ""
        };
    }

    async menuModels() {
        const data = await this.chatbotClient.listModels();
        const models = [];
        const providers = [];
        for (const [index, model] of data.data.listModels.entries()) {
            if (model.name.length === 0) continue;
            models.push({
                firstcolvalue: model.name,
                response: "/select-model " + index,
            });
            providers.push({
                modelName: model.name,
                provider: model.provider,
            });
        }
        return {
            table: {
                name: 'List of Models',
                firstcolname: 'Model',
                actioncolname: 'Select',
                rows: models,
            },
            providers: providers
        }
    }

    async menuWorkspaces() {
        const data = await this.chatbotClient.listWorkspaces();
        let workspaceNames = [];
        let workspaces = [];
        for (const [index, workspace] of data.data.listWorkspaces.entries()) {
            workspaceNames.push({
                firstcolvalue: workspace.name,
                response: "/select-rag-workspace " + index,
            });
            workspaces.push({
                name: workspace.name,
                id: workspace.id,
            });
        }
        // add an option to select "none"
        workspaceNames.push({
            firstcolvalue: "none",
            response: "/select-rag-workspace " + workspaceNames.length,
        });
        workspaces.push({
            name: "",
            id: "",
        });
        return {
            table: {
                name: 'List of Workspaces',
                firstcolname: 'Workspace',
                actioncolname: 'Select',
                rows: workspaceNames,
            },
            workspaces: workspaces
        }
    }
}


module.exports = {
    CommandInterpreter
};
