// Role → pixel-sprite accessories. Shape carries identity; color comes
// from the agent's soft palette so roles stay recognizable but unique.
const FALLBACK = { hat: 'hood', tool: 'staff', ears: 'round' };

export const ROLE_SILHOUETTES = {
  'ceo-warlock': { hat: 'crown', tool: 'scepter', ears: 'round' },
  'hr-mind-flayer': { hat: 'tentacles', tool: 'orb', ears: 'none' },
  'staff-engineer-paladin': { hat: 'helm', tool: 'sword', ears: 'round' },
  'senior-analyst-diviner': { hat: 'hood', tool: 'orb', ears: 'pointy' },
  'marshall-agent-system-inspector': { hat: 'visor', tool: 'badge', ears: 'round' },
  'manager-bard': { hat: 'feather', tool: 'lute', ears: 'pointy' },
  'solution-architect-wizard': { hat: 'pointed', tool: 'staff', ears: 'round' },
  'backend-dev-cleric': { hat: 'halo', tool: 'hammer', ears: 'round' },
  'frontend-dev-sorcerer': { hat: 'glow', tool: 'orb', ears: 'pointy' },
  'qa-engineer-rogue': { hat: 'hood', tool: 'daggers', ears: 'pointy' },
  'devops-sre-dragonborn-warmage': { hat: 'horns', tool: 'staff', ears: 'fins' },
  'system-analyst-blood-hunter': { hat: 'hood', tool: 'sword', ears: 'round' },
  'information-sourcer-ranger': { hat: 'cap', tool: 'bow', ears: 'pointy' },
  'office-librarian-artificer': { hat: 'goggles', tool: 'wrench', ears: 'round' },
  'designers-changeling-sculptor': { hat: 'beret', tool: 'brush', ears: 'pointy' },
  'cybersecurity-death-knight-lich': { hat: 'skull', tool: 'scythe', ears: 'none' },
  'product-manager-doppelganger': { hat: 'mask', tool: 'lute', ears: 'round' },
  'scrum-master-monk': { hat: 'beads', tool: 'staff', ears: 'round' },
  'data-scientist-alchemist-diviner': { hat: 'spectacles', tool: 'flask', ears: 'round' },
  'legal-compliance-inquisitor': { hat: 'mitre', tool: 'scroll', ears: 'round' },
  'cleaner-facilities-barbarian': { hat: 'horns', tool: 'axe', ears: 'round' },
  'excel-admin-druid': { hat: 'wreath', tool: 'staff', ears: 'pointy' },
  'consultant-vampires': { hat: 'cape', tool: 'chalice', ears: 'pointy' },
  'interns-kobolds-goblins': { hat: 'none', tool: 'wrench', ears: 'pointy' },
  'code-reviewer-justicar': { hat: 'hood', tool: 'scroll', ears: 'round' },
  'tech-writer-scribe': { hat: 'spectacles', tool: 'quill', ears: 'round' }
};

export function silhouetteForRole(role) {
  return ROLE_SILHOUETTES[role] || FALLBACK;
}
