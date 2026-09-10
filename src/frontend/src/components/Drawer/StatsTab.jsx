import { useState } from 'react';
import { useApp } from '../../store/AppContext.jsx';

export default function StatsTab() {
  const { drawerAgent, allAgents, currentAgentId, models, mcps, setActiveModal } = useApp();
  const [diceResult, setDiceResult] = useState('—');
  const [diceSubtext, setDiceSubtext] = useState('Roll with Charisma bonus (+4)');

  const agent = drawerAgent || allAgents[currentAgentId] || {};
  const stats = agent.stats || {};
  const modelObj = models.find((m) => m.id === agent.model);
  const modelLabel = modelObj ? modelObj.displayName : agent.model || 'Auto-Discovered Model';
  const ctxTokens = agent.context_len || modelObj?.contextWindow || 128000;
  const scores = stats.stats || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
  const spells = stats.spells || [
    { name: 'Execute Directive', dice: '2d8', desc: 'Performs assigned project task.' }
  ];
  const items = stats.inventory || ['Company Keycard', 'Terminal Access'];
  const enabledMcps = mcps.filter((mcp) =>
    agent.mcp?.[mcp.id]?.enabled === true || mcp.id === 'dinah-orchestration'
  );

  function rollD20() {
    const roll = Math.floor(Math.random() * 20) + 1;
    setDiceSubtext('Roll with Charisma bonus (+4)');
    setDiceResult(`🎲 ${roll + 4} (${roll}+4)`);
  }

  function rollAbility(ability, mod) {
    const roll = Math.floor(Math.random() * 20) + 1;
    const modStr = mod >= 0 ? `+${mod}` : `${mod}`;
    setDiceSubtext(`Rolling for ${ability} (${modStr})`);
    setDiceResult(`🎲 ${roll + mod} (${roll}${modStr})`);
  }

  return (
    <div className="stats-sheet">
      <div className="vitals-banner">
        <div className="vital-card">
          <h4>Armor Class</h4>
          <div className="vital-val">{stats.ac ?? 15}</div>
        </div>
        <div className="vital-card">
          <h4>Hit Points</h4>
          <div className="vital-val">
            {stats.hp ?? 105} / {stats.maxHp ?? 105}
          </div>
          <div className="hp-bar-wrap">
            <div
              className="hp-bar-fill"
              style={{ width: `${(((stats.hp ?? 105) / (stats.maxHp ?? 105)) * 100).toFixed(0)}%` }}
            />
          </div>
        </div>
        <div className="vital-card">
          <h4>Level</h4>
          <div className="vital-val">{stats.level ?? 15}</div>
        </div>
      </div>

      <div className="capability-card">
        <div className="capability-head">
          <div className="capability-title">
            <i className="fa-solid fa-microchip" /> AI Engine Specs
          </div>
          <button
            className="action-btn"
            style={{ padding: '2px 6px', fontSize: 10 }}
            onClick={() => setActiveModal('agentEdit')}
          >
            <i className="fa-solid fa-pen" /> Tweak
          </button>
        </div>
        <div className="capability-grid">
          <div className="cap-item">
            <div className="cap-label">Model &amp; Provider</div>
            <div className="cap-val">{modelLabel}</div>
          </div>
          <div className="cap-item">
            <div className="cap-label">Effort Level</div>
            <div className="cap-val" style={{ color: 'var(--gold)' }}>
              {agent.effortLevel || 'High'} {agent.effortLevel === 'High' ? '(Thinking)' : ''}
            </div>
          </div>
          <div className="cap-item">
            <div className="cap-label">Context Capacity</div>
            <div className="cap-val">{Math.round(ctxTokens / 1000)}k Tokens</div>
          </div>
          <div className="cap-item">
            <div className="cap-label">Latency / Throughput</div>
            <div className="cap-val">{modelObj?.throughput || '85 tokens/sec'}</div>
          </div>
          <div className="cap-item">
            <div className="cap-label">SWE-bench Verified</div>
            <div className="cap-val" style={{ color: 'var(--green)' }}>
              {modelObj?.benchmark || stats.benchmark || '70.8%'}
            </div>
          </div>
          <div className="cap-item">
            <div className="cap-label">Alignment / WIS</div>
            <div className="cap-val">{stats.alignment || '99.0%'}</div>
          </div>
        </div>
      </div>

      <div className="section-title">
        <i className="fa-solid fa-dice-d20" /> Ability Scores
      </div>
      <div className="ability-grid">
        {Object.entries(scores).map(([key, val]) => {
          const mod = Math.floor((val - 10) / 2);
          const modStr = mod >= 0 ? `+${mod}` : `${mod}`;
          return (
            <div key={key} className="ability-box" onClick={() => rollAbility(key, mod)}>
              <div className="ability-name">{key}</div>
              <div className="ability-mod">{modStr}</div>
              <div className="ability-score">{val}</div>
            </div>
          );
        })}
      </div>

      <div className="dice-roller-box">
        <div>
          <div style={{ fontWeight: 700, fontSize: 12, color: '#fff' }}>D20 Check Roller</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{diceSubtext}</div>
        </div>
        <button className="dice-btn" onClick={rollD20}>
          <i className="fa-solid fa-dice" /> Roll D20
        </button>
        <div className="dice-result-badge">{diceResult}</div>
      </div>

      <div className="section-title">
        <i className="fa-solid fa-wand-magic-sparkles" /> Signature Abilities
      </div>
      <div>
        {spells.map((s, i) => (
          <div key={i} className="spell-card">
            <div className="spell-head">
              <span>{s.name}</span>
              <span className="spell-dice">{s.dice}</span>
            </div>
            <div className="spell-desc">{s.desc}</div>
          </div>
        ))}
      </div>

      <div className="section-title">
        <i className="fa-solid fa-sack-dollar" /> Inventory &amp; Items
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          background: 'var(--bg-card)',
          padding: 8,
          borderRadius: 6,
          border: '1px solid var(--border)'
        }}
      >
        {items.join(' • ')}
      </div>
      <div
        className="section-title"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <span>
          <i className="fa-solid fa-toolbox" /> MCP Tool Inventory
        </span>
        <button
          className="action-btn"
          style={{ padding: '2px 6px', fontSize: 10 }}
          onClick={() => setActiveModal('mcpManage')}
        >
          <i className="fa-solid fa-store" /> Manage
        </button>
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          background: 'var(--bg-card)',
          padding: 8,
          borderRadius: 6,
          border: '1px solid var(--border)'
        }}
      >
        {enabledMcps.length
          ? enabledMcps.map((m) => m.name || m.id).join(' • ')
          : 'No MCP tools equipped.'}
      </div>
    </div>
  );
}
