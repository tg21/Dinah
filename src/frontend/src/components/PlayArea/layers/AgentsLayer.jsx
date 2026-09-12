import AgentSprite from '../../Agents/AgentSprite.jsx';

// Layer 2 — one AgentSprite per agent, always above WorldObjectsLayer.
export default function AgentsLayer({ agents, positions, selectedId, thoughts, bubbles, onPick }) {
  return (
    <div className="scene-layer agents">
      {Object.entries(agents).map(([id, agent]) => {
        const pos = positions[id] || { x: 800, y: 600 };
        const thought = bubbles[id] || thoughts[id]?.currentThought;
        return (
          <AgentSprite
            key={id}
            agent={agent}
            agentId={id}
            selected={selectedId === id}
            thought={thought}
            onClick={() => onPick?.(id)}
            style={{ left: pos.x, top: pos.y }}
          />
        );
      })}
    </div>
  );
}
