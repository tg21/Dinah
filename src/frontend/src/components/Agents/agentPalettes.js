// Soft adventurer palettes. Never hardcoded in sprites — pick one per agent
// at creation (persisted in hr-system as agent.appearance) so every agent
// looks unique yet soothing. Labels are plain color names on purpose:
// palettes are role-agnostic (random per agent), not tied to any class.
export const AGENT_PALETTES = [
  { id: 0, name: 'Mint', cloak: '#A8DDBB', trim: '#5E9E6E', skin: '#F2C9A8', hat: '#7FB894', pants: '#6B5D4F' },
  { id: 1, name: 'Peach', cloak: '#F2C18D', trim: '#9A7433', skin: '#F6CFB0', hat: '#C98F5A', pants: '#6B5D4F' },
  { id: 2, name: 'Lavender', cloak: '#CDBCE8', trim: '#7A6AA8', skin: '#F2C9A8', hat: '#9A86C9', pants: '#5D5470' },
  { id: 3, name: 'Sky', cloak: '#A9CDE8', trim: '#5A7FA8', skin: '#F6CFB0', hat: '#7FA8C9', pants: '#4A5A6B' },
  { id: 4, name: 'Rose', cloak: '#E8AFAF', trim: '#A85A5A', skin: '#F6CFB0', hat: '#C97F7F', pants: '#6B4A4A' },
  { id: 5, name: 'Sand', cloak: '#E8D9A8', trim: '#9A8A4A', skin: '#E8B88D', hat: '#C9B37E', pants: '#6B5D4F' },
  { id: 6, name: 'Leaf', cloak: '#B5C99A', trim: '#6A8A4A', skin: '#F2C9A8', hat: '#8AA863', pants: '#4A5A3B' },
  { id: 7, name: 'Stone', cloak: '#D8CFC0', trim: '#8A7B6C', skin: '#F6CFB0', hat: '#A89A86', pants: '#5D5348' }
];

export const MAIL_PALETTES = ['#F9DDBB', '#D6F0DE', '#E4D9F5', '#D4E6F5', '#F5D5D5', '#F2E8C0'];

export function paletteById(id) {
  if (typeof id !== 'number') return AGENT_PALETTES[0];
  return AGENT_PALETTES[((id % AGENT_PALETTES.length) + AGENT_PALETTES.length) % AGENT_PALETTES.length];
}
