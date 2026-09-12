import AgentSprite from '../../Agents/AgentSprite.jsx';
import { useApp } from '../../../store/AppContext.jsx';
import { silhouetteForRole } from '../../Agents/roleSilhouettes.js';

// Layer 2 — one AgentSprite per agent, always above WorldObjectsLayer.
export default function AgentsLayer({ agents, positions, activities, selectedId, thoughts, bubbles, onPick }) {
  const { roleSprites } = useApp();
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
            silhouette={silhouetteForRole(agent.role, roleSprites)}
            activity={activities?.[id] || 'idle'}
            facing={pos.facing || 1}
            thought={thought}
            selected={selectedId === id}
            onClick={() => onPick?.(id)}
            style={{ left: pos.x, top: pos.y }}
          />
        );
      })}
    </div>
  );
}
