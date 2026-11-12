declare module '*?raw' { const content: string; export default content; }
declare module '*.openslop2mission' { const data: import('./campaign/data/MissionData').MissionData; export default data; }
