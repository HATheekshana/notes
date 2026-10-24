import { Atom, BarChart3, BookOpen, Bot, Boxes, Braces, Brain, Briefcase, Calculator, Cloud, Code, Cpu, Database, FlaskConical, Globe, Languages, Layers, Lightbulb, Network, Palette, Server, ShieldCheck, Smartphone, Terminal, Users, Workflow } from 'lucide-react';

// Every name in ICON_NAMES must appear here (a test checks it). Unknown names fall back to a book.
export const subjectIcons = { Braces, Cpu, Globe, Database, Boxes, BookOpen, Calculator, Network, ShieldCheck, Code, Server, BarChart3, Briefcase, Layers, FlaskConical, Palette, Terminal, Workflow, Lightbulb, Languages, Atom, Smartphone, Cloud, Bot, Brain, Users } as const;
export const iconFor = (name: string) => (subjectIcons as Record<string, typeof BookOpen>)[name] || BookOpen;
