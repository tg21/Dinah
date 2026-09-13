/**
 * Fallback simulation harness when no external AI harness is installed on host.
 * If you see messages from this then something went wrong (e.g- you ran out of credit)
 * TODO: Implement a feature for harness/model preference list in future, so that it works seamlessly
 */
export function getSystemSimulatorModels() {
  return [
    {
      id: 'system-simulator/balanced-agent',
      displayName: 'System Simulator - Balanced Agent (LOCAL)',
      capabilities: {
        text: true,
        vision: true,
        tools: true,
        parallelTools: true,
        thinking: true,
        extendedThinking: true
      },
      reasoning: {
        type: 'effort',
        levels: ['Low', 'Medium', 'High', 'Extreme'],
        minTokens: 1000,
        maxTokens: 32000
      },
      contextWindow: 128000,
      source: {
        harness: 'system-simulator',
        provider: 'System Local'
      }
    },
    {
      id: 'system-simulator/fast-light',
      displayName: 'System Simulator - Fast Lightweight (LOCAL)',
      capabilities: {
        text: true,
        vision: false,
        tools: true,
        parallelTools: true,
        thinking: false
      },
      reasoning: {
        type: 'none'
      },
      contextWindow: 64000,
      source: {
        harness: 'system-simulator',
        provider: 'System Local'
      }
    }
  ];
}
