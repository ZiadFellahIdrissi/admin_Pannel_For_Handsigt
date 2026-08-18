const { GoogleGenAI } = require('@google/genai');
const candidateModel = require('../models/candidateModel');

// Cheapest/fastest Gemini tier - plenty for mapping a short sentence onto
// a handful of fields, and free-tier eligible in Google AI Studio.
const MODEL = 'gemini-3.5-flash-lite';

// Mirrors candidateModel.list()'s filter parameters exactly - the LLM's
// only job is deciding which of these to set from a free-text prompt.
// Every value it returns still passes through candidateModel.list()'s own
// validation (STATUSES.includes, GENDERS.includes, Number.isFinite, etc.)
// before it can affect a query, so a hallucinated enum value or garbage
// number is silently dropped there rather than trusted here.
const FILTER_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: candidateModel.STATUSES },
    q: { type: 'string', description: 'Only a specific candidate name or email mentioned in the prompt.' },
    minExperience: { type: 'number', description: 'Minimum years of experience.' },
    position: { type: 'string', description: 'Job role/title, e.g. "Data Engineer".' },
    skills: { type: 'string', description: 'The single most specific skill mentioned.' },
    city: { type: 'string' },
    country: { type: 'string' },
    gender: { type: 'string', enum: candidateModel.GENDERS },
    educationLevel: { type: 'string', enum: candidateModel.EDUCATION_LEVELS },
    specialty: { type: 'string' },
    certifications: { type: 'string', description: 'The single most specific certification mentioned.' },
    languages: { type: 'string', description: 'The single most specific language mentioned.' },
    availability: { type: 'string' },
    source: { type: 'string' },
    minRating: { type: 'integer', description: '1 to 5.' },
    maxSalary: { type: 'number', description: 'Budget ceiling on expected salary.' },
    maxTjm: { type: 'number', description: 'Budget ceiling on expected daily rate (TJM).' },
    openToCdd: { type: 'boolean' },
    openToCdi: { type: 'boolean' },
    openToFreelance: { type: 'boolean' }
  }
};

const SYSTEM_INSTRUCTION = `You turn a recruiter's free-text description of a candidate into a structured filter object for a candidate database search.

Rules:
- Only set a field when the prompt gives clear information for it. Omit everything else - do not guess or pad.
- "skills", "certifications", "languages" are each a single substring search term, not a list - pick the one most specific term the prompt actually names.
- minExperience is in years. minRating is 1 to 5.
- maxSalary / maxTjm are budget ceilings - only set them if the prompt states a salary or rate constraint.
- openToCdd/openToCdi/openToFreelance are only ever set to true, and only when the prompt explicitly names that contract type. Never set them to false.
- Never invent a value for status, gender, or educationLevel outside the enum you were given for that field.`;

let client = null;
function getClient() {
  if (!client) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY is not set.');
    }
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

// Converts a recruiter's free-text prompt (e.g. "freelance data engineer
// in Casablanca, open to CDI, rating 4+") into the same filter shape
// candidateModel.list() and the Candidates page's filter form both use.
// Only the prompt text and the static schema above are ever sent to
// Gemini - candidate records never leave this app.
async function buildFilterFromPrompt(prompt) {
  const ai = getClient();
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: prompt,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: 'application/json',
      responseJsonSchema: FILTER_SCHEMA
    }
  });

  const parsed = JSON.parse(response.text);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

module.exports = { buildFilterFromPrompt };
