we need to make how agents communicate with user better.
e.g- 
1. how manager/ceo or any other agent can ask user questions.
 - we need to fix that mcp so that it explictly accepts and agents explitly send clear questions in mutliple choice questions (MCQ) format. If agents want subjective answer, then they can leave the options array empty, and on frontend that will mean user has has to input free text. But if agents send options, then on frontend that question is displayed with options as radio buttons and free text input as last radio button.
 - On frontend will show this question like how choices appear in Baldur's gate 3. in chatbox it'll say you have a qeustion with question. clicking it will open a tranlucent( 30 % opacity) modal/dialog towards the bottom-center of screen. With questions and options. submitting the answer will send the result to agent.

 2. 'Inform the User' MCP
  - Just like we have tool to let user ask the question. We need to have a tool to let agent just inform about something.e.g- a project work is finished, the agent will need to inform the user.
  - It too will show an animation around agent(for few seconds like it does when questions happen, different soft color though if we can not necessary, so that user can distinguish ) when there is an information even. this information message can be seen in chat like any other message.

  3. Messaes that are sent to usre should only appear in agennt's chat box (as they do right now), they shuld not appear in messaes panel (that is only to see agent-to-agent communication).
  4. messages in chat box or in messaes box should be scrolled down to last message when that those panels are accessed.
  5. the messag panel for agent-to-agent communication shows messaesses in reverse order, it should show latest messages at the bottom and older messages towards top (like how  most message views work).
