export type ModalityType = "visual" | "text" | "auditory" | "example";

export interface OnboardingOption {
  key: string;
  text: string;
  modality: ModalityType;
}

export interface OnboardingQuestion {
  id: number;
  scenario: string;
  options: OnboardingOption[];
}

export const PREDEFINED_QUESTIONS: OnboardingQuestion[] = [
  {
    id: 1,
    scenario: "When encountering a brand new, complex topic for the first time, what is your immediate preferred instinct to grasp it?",
    options: [
      { key: "A", text: "Look for a high-level flowchart, architecture diagram, or visual map.", modality: "visual" },
      { key: "B", text: "Read a clear, structured article or comprehensive documentation with definitions.", modality: "text" },
      { key: "C", text: "Listen to a conversational podcast or have someone explain it aloud step by step.", modality: "auditory" },
      { key: "D", text: "Study a real-world case study or practical scenario showing it in action.", modality: "example" },
    ],
  },
  {
    id: 2,
    scenario: "You are trying to retain and recall a dense concept you learned earlier this week. What helps it stick best in your memory?",
    options: [
      { key: "A", text: "Visualizing the spatial layout, colors, mind maps, or chart relationships.", modality: "visual" },
      { key: "B", text: "Reviewing organized bullet points, glossary terms, and written summaries.", modality: "text" },
      { key: "C", text: "Replaying a spoken explanation or discussing the concept verbally with someone.", modality: "auditory" },
      { key: "D", text: "Remembering a vivid analogy or practical story that illustrated the core point.", modality: "example" },
    ],
  },
  {
    id: 3,
    scenario: "When you get completely stuck on a difficult problem, what approach unlocks your understanding fastest?",
    options: [
      { key: "A", text: "Sketching out the components, arrows, and block diagrams on paper or a whiteboard.", modality: "visual" },
      { key: "B", text: "Searching for detailed written explanations, FAQs, and authoritative specs.", modality: "text" },
      { key: "C", text: "Talking through the problem out loud or listening to an expert voice walkthrough.", modality: "auditory" },
      { key: "D", text: "Looking at a solved example or counter-example of a similar problem.", modality: "example" },
    ],
  },
  {
    id: 4,
    scenario: "How do you prefer to review material right before an assessment or interview?",
    options: [
      { key: "A", text: "Scanning visual cheat sheets, infographic overviews, and system diagrams.", modality: "visual" },
      { key: "B", text: "Reading through curated summary notes, key takeaway lists, and written glossaries.", modality: "text" },
      { key: "C", text: "Listening to a quick audio recap or explaining key points out loud.", modality: "auditory" },
      { key: "D", text: "Practicing with concrete scenario questions and application prompts.", modality: "example" },
    ],
  },
  {
    id: 5,
    scenario: "You need to understand how an intricate multi-component system works end-to-end. What would you open first?",
    options: [
      { key: "A", text: "An interactive sequence diagram or architectural blueprint showing component links.", modality: "visual" },
      { key: "B", text: "A detailed technical manual outlining every subsystem's responsibilities.", modality: "text" },
      { key: "C", text: "An engineering tech talk or recorded presentation walking through the architecture.", modality: "auditory" },
      { key: "D", text: "A step-by-step walkthrough of a user transaction traveling through the system.", modality: "example" },
    ],
  },
  {
    id: 6,
    scenario: "During an educational presentation or lecture, which element keeps your focus and engagement at its peak?",
    options: [
      { key: "A", text: "Clean slides featuring diagrams, graphs, animations, and minimal clutter.", modality: "visual" },
      { key: "B", text: "Well-crafted slide text, detailed outlines, and downloadable lecture notes.", modality: "text" },
      { key: "C", text: "An expressive, charismatic speaker who uses tone, pacing, and dialogue effectively.", modality: "auditory" },
      { key: "D", text: "Engaging real-life anecdotes, failure stories, and contextual case studies.", modality: "example" },
    ],
  },
  {
    id: 7,
    scenario: "You are trying to explain a tricky technical concept to a peer or teammate. What is your go-to technique?",
    options: [
      { key: "A", text: "Drawing boxes and arrows on a board or screen share to show the structure.", modality: "visual" },
      { key: "B", text: "Writing out a structured guide with clear headings and bulleted takeaways.", modality: "text" },
      { key: "C", text: "Using a conversational dialogue, asking questions and explaining aloud.", modality: "auditory" },
      { key: "D", text: "Comparing it to an everyday experience using a relatable metaphor or example.", modality: "example" },
    ],
  },
  {
    id: 8,
    scenario: "When debugging an unexpected error or misconception in your work, what gives you the clearest insight?",
    options: [
      { key: "A", text: "Looking at a visual trace, dependency tree, or diagram of the process.", modality: "visual" },
      { key: "B", text: "Reading the full error report, documentation guidelines, and troubleshooting manuals.", modality: "text" },
      { key: "C", text: "Talking through the issue out loud or having a voice discussion about it.", modality: "auditory" },
      { key: "D", text: "Comparing your broken attempt against a working reference case.", modality: "example" },
    ],
  },
  {
    id: 9,
    scenario: "You have 30 minutes to explore a completely unfamiliar technology or domain. What do you do?",
    options: [
      { key: "A", text: "Browse architectural infographics, concept maps, and visual landscape charts.", modality: "visual" },
      { key: "B", text: "Read the official 'Getting Started' guide, introductory whitepaper, or overview doc.", modality: "text" },
      { key: "C", text: "Listen to an audio overview, podcast episode, or explanatory speech.", modality: "auditory" },
      { key: "D", text: "Read customer stories or problem-solution case studies.", modality: "example" },
    ],
  },
  {
    id: 10,
    scenario: "What gives you the highest confidence that you have truly mastered a topic?",
    options: [
      { key: "A", text: "Being able to reconstruct the complete system diagram or mind map from memory.", modality: "visual" },
      { key: "B", text: "Being able to write a clear, accurate, and comprehensive reference guide on it.", modality: "text" },
      { key: "C", text: "Being able to comfortably lecture, discuss, or debate it in a conversation.", modality: "auditory" },
      { key: "D", text: "Successfully solving a nuanced, unfamiliar real-world problem using it.", modality: "example" },
    ],
  },
];
