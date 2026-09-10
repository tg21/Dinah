see the logs in working-area/hello-world
Manager doesn't keep working autonomously. Doesn't always start working by himself after user response.
Manager's communication with HR for creating new specialized agents was not visible in the frontend (not present in HRs messages in side drawer)
HR did spawn agents, but there were no chats/thoughts/messages in HR mind flayer's side drawer.
HR didn't have default mcps activated by default on frontend (the checkboxes were empty in mcp manager dialog for HR.)
For HR or any other agent, we should actiavate their 'required_tools' or any other tools 'manager_tools' for manager mentioned in their json files.
in coordination.json in shared-state folder, assignee and AgenId properties should be just agent Ids and there should be a sperate property for project rather than doing concatenation like this `"assignee": "hello world-manager-bard"`
Spawned specialized agents didn't start working on thier tasks after being spwaned (they were approved to spawn by user).

and what the hell is going on with the knowledge-base.json, why is there random crap in there rather then projects' knowledge base.
