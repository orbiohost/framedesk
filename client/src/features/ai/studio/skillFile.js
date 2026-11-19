// Skills as a portable .json file: export from one workspace, import into
// another (or share with a friend). Only the skill's content travels.

const FORMAT = 'framedesk-skills';
const VERSION = 1;
const CATEGORIES = ['writing', 'video', 'social', 'client', 'planning', 'analysis', 'other'];
const LIMITS = { name: 60, description: 200, emoji: 8, instructions: 6000, example: 4000 };

export const SKILL_CATEGORY_LABELS = {
  writing: 'Writing',
  video: 'Video',
  social: 'Social',
  client: 'Clients',
  planning: 'Planning',
  analysis: 'Analysis',
  other: 'Other',
};

function portable(skill) {
  return {
    name: skill.name,
    emoji: skill.emoji || '',
    category: skill.category || 'other',
    description: skill.description || '',
    instructions: skill.instructions,
    example: skill.example || '',
  };
}

function slug(text) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'skill'
  );
}

// Downloads the skills as one .json file.
export function downloadSkills(skills, fileName) {
  const payload = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    skills: skills.map(portable),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download =
    fileName ?? (skills.length === 1 ? `${slug(skills[0].name)}.skill.json` : 'skills.json');
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// The skill as plain text, for pasting into a chat or doc.
export function skillAsText(skill) {
  return [
    `${skill.emoji ? `${skill.emoji} ` : ''}${skill.name}`,
    skill.description,
    '',
    skill.instructions,
    skill.example ? `\nExample:\n${skill.example}` : '',
  ]
    .filter((line) => line !== undefined)
    .join('\n')
    .trim();
}

function clip(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// Reads an exported file. Throws an Error with a friendly message when it isn't one.
export async function readSkillFile(file) {
  if (file.size > 2 * 1024 * 1024) throw new Error('That file is too large to be a skills file.');
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('That file isn’t valid JSON. Pick a .json file exported from FrameDesk.');
  }
  const list = Array.isArray(data) ? data : data?.skills;
  if (!Array.isArray(list)) throw new Error('No skills found in that file.');
  const skills = list
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      name: clip(item.name, LIMITS.name),
      emoji: clip(item.emoji, LIMITS.emoji),
      category: CATEGORIES.includes(item.category) ? item.category : 'other',
      description: clip(item.description, LIMITS.description),
      instructions: clip(item.instructions, LIMITS.instructions),
      example: clip(item.example, LIMITS.example),
    }))
    .filter((item) => item.name && item.instructions.length >= 10);
  if (skills.length === 0) throw new Error('No usable skills found in that file.');
  return skills.slice(0, 50);
}
