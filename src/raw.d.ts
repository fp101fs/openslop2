declare module '*?raw' { const content: string; export default content; }
declare module '*.opensc2mission' { const data: import('./campaign/data/MissionData').MissionData; export default data; }
