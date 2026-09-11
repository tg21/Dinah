// Role archetype visual configuration.
// Ported verbatim from src/frontend.html ROLE_CONFIGS so canvas tokens,
// executive cards, and drawer headers keep identical visuals.
export const ROLE_CONFIGS = {
  'ceo-warlock': { icon: '👑', color: '#9b59b6', hat: 'crown', tool: 'scepter', cloth: '#552277', hair: '#111111', pants: '#331144' },
  'hr-mind-flayer': { icon: '🦑', color: '#8e44ad', hat: 'tentacles', tool: 'orb', cloth: '#441166', skin: '#7d669e', pants: '#220033' },
  'staff-engineer-paladin': { icon: '⚔️', color: '#f1c40f', hat: 'helm', tool: 'sword', cloth: '#e67e22', hair: '#e0e0e0', pants: '#7f8c8d' },
  'senior-analyst-diviner': { icon: '🔮', color: '#9c27b0', hat: 'hood', tool: 'orb', cloth: '#4a148c', hair: '#9575cd', pants: '#311b92' },
  'marshall-agent-system-inspector': { icon: '🛡️', color: '#00bcd4', hat: 'visor', tool: 'badge', cloth: '#0097a7', hair: '#cfd8dc', pants: '#006064' },
  'manager-bard': { icon: '🧝', color: '#e67e22', hat: 'feather', tool: 'lute', cloth: '#dd6633', hair: '#f39c12', pants: '#5a3825' },
  'solution-architect-wizard': { icon: '🧙‍♂️', color: '#3498db', hat: 'pointed', tool: 'staff', cloth: '#2980b9', hair: '#ecf0f1', pants: '#1a5276' },
  'backend-dev-cleric': { icon: '✝️', color: '#1abc9c', hat: 'halo', tool: 'hammer', cloth: '#16a085', hair: '#7f8c8d', pants: '#117a65' },
  'frontend-dev-sorcerer': { icon: '✨', color: '#e91e63', hat: 'glow', tool: 'orb', cloth: '#d81b60', hair: '#f06292', pants: '#880e4f' },
  'qa-engineer-rogue': { icon: '🗡️', color: '#27ae60', hat: 'hood', tool: 'daggers', cloth: '#2e7d32', hair: '#1b5e20', pants: '#212121' },
  'devops-sre-dragonborn-warmage': { icon: '🐉', color: '#e74c3c', hat: 'horns', tool: 'staff', cloth: '#c0392b', hair: '#962d22', pants: '#641e16' },
  'system-analyst-blood-hunter': { icon: '🩸', color: '#c0392b', hat: 'hood', tool: 'sword', cloth: '#78281f', hair: '#17202a', pants: '#424949' },
  'information-sourcer-ranger': { icon: '🏹', color: '#27ae60', hat: 'cap', tool: 'bow', cloth: '#196f3d', hair: '#7d6608', pants: '#515a5a' },
  'office-librarian-artificer': { icon: '📜', color: '#d35400', hat: 'goggles', tool: 'wrench', cloth: '#a04000', hair: '#566573', pants: '#6e2c00' },
  'designers-changeling-sculptor': { icon: '🎨', color: '#9b59b6', hat: 'beret', tool: 'brush', cloth: '#8e44ad', hair: '#f5b041', pants: '#4a235a' },
  'cybersecurity-death-knight-lich': { icon: '💀', color: '#34495e', hat: 'skull', tool: 'scythe', cloth: '#1b2631', hair: '#85929e', pants: '#17202a' },
  'product-manager-doppelganger': { icon: '🎭', color: '#f39c12', hat: 'mask', tool: 'lute', cloth: '#b7950b', hair: '#2c3e50', pants: '#7d6608' },
  'scrum-master-monk': { icon: '🧘', color: '#f1c40f', hat: 'beads', tool: 'staff', cloth: '#d4ac0d', hair: '#17202a', pants: '#9a7d0a' },
  'data-scientist-alchemist-diviner': { icon: '🧪', color: '#16a085', hat: 'spectacles', tool: 'flask', cloth: '#117a65', hair: '#95a5a6', pants: '#0e6251' },
  'legal-compliance-inquisitor': { icon: '⚖️', color: '#7f8c8d', hat: 'mitre', tool: 'scroll', cloth: '#5d6d7e', hair: '#273746', pants: '#34495e' },
  'cleaner-facilities-barbarian': { icon: '🪓', color: '#e74c3c', hat: 'horns', tool: 'axe', cloth: '#922b21', hair: '#641e16', pants: '#4a235a' },
  'excel-admin-druid': { icon: '📊', color: '#2ecc71', hat: 'wreath', tool: 'staff', cloth: '#229954', hair: '#196f3d', pants: '#145a32' },
  'consultant-vampires': { icon: '🧛', color: '#8e44ad', hat: 'cape', tool: 'chalice', cloth: '#5b2c6f', hair: '#17202a', pants: '#4a235a' },
  'interns-kobolds-goblins': { icon: '🦎', color: '#27ae60', hat: 'none', tool: 'wrench', cloth: '#1e8449', hair: '#145a32', pants: '#239b56' },
  'code-reviewer-justicar': { icon: '🔎', color: '#7f8c8d', hat: 'hood', tool: 'scroll', cloth: '#5d6d7e', hair: '#273746', pants: '#34495e' },
  'tech-writer-scribe': { icon: '📝', color: '#d4ac0d', hat: 'spectacles', tool: 'quill', cloth: '#7d6608', hair: '#566573', pants: '#6e2c00' }
};

export const OVERSEER_IDS = [
  'ceo-warlock',
  'hr-mind-flayer',
  'staff-engineer-paladin',
  'senior-analyst-diviner',
  'marshall-agent-system-inspector'
];

export const SPAWNABLE_ROLES = [
  ['solution-architect-wizard', 'Solution Architect Wizard'],
  ['backend-dev-cleric', 'Backend Dev Cleric'],
  ['frontend-dev-sorcerer', 'Frontend Dev Sorcerer'],
  ['qa-engineer-rogue', 'QA Engineer Rogue'],
  ['devops-sre-dragonborn-warmage', 'DevOps SRE Dragonborn Warmage'],
  ['system-analyst-blood-hunter', 'System Analyst Blood Hunter'],
  ['information-sourcer-ranger', 'Information Sourcer Ranger'],
  ['office-librarian-artificer', 'Office Librarian Artificer'],
  ['designers-changeling-sculptor', 'Designer Changeling Sculptor'],
  ['cybersecurity-death-knight-lich', 'Cybersecurity Lich'],
  ['product-manager-doppelganger', 'Product Manager Doppelgänger'],
  ['scrum-master-monk', 'Scrum Master Monk'],
  ['data-scientist-alchemist-diviner', 'Data Scientist Alchemist'],
  ['legal-compliance-inquisitor', 'Legal Inquisitor'],
  ['cleaner-facilities-barbarian', 'Cleaner Barbarian'],
  ['excel-admin-druid', 'Excel Admin Druid'],
  ['consultant-vampires', 'Consultant Vampire'],
  ['interns-kobolds-goblins', 'Intern Kobold / Goblin'],
  ['code-reviewer-justicar', 'Code Reviewer Justicar'],
  ['tech-writer-scribe', 'Tech Writer Scribe']
];

export function roleConf(role) {
  return ROLE_CONFIGS[role] || ROLE_CONFIGS['manager-bard'];
}
