export const WORDS = 'stethoscope,hourglass,avalanche,scarecrow,submarine,trampoline,labyrinth,parachute,telescope,skyscraper,chandelier,hammock,windmill,anchor,blacksmith,bagpipes,snorkel,quicksand,eclipse,compass,fireworks,scuba diver,tightrope,jellyfish,octopus,kangaroo,chameleon,flamingo,hedgehog,porcupine,seahorse,scorpion,peacock,dinosaur,mermaid,unicorn,vampire,zombie,werewolf,magician,astronaut,detective,firefighter,ballerina,gladiator,samurai,viking,pharaoh,pyramid,igloo,drawbridge,lighthouse,carousel,ferris wheel,roller coaster,hot air balloon,cable car,bulldozer,helicopter,spaceship,satellite,microscope,thermometer,binoculars,magnifying glass,typewriter,gramophone,accordion,saxophone,xylophone,harmonica,skateboard,snowboard,surfboard,bow and arrow,boomerang,catapult,passport,treasure map,pirate ship,message in a bottle,wishing well,haunted house,tree house,sandcastle,snow globe,lava lamp,piggy bank,vending machine,traffic light,speed bump,fire hydrant,washing machine,vacuum cleaner,wheelbarrow,lawn mower,dandelion,bonsai,venus flytrap,tornado,earthquake,thunderstorm,northern lights,shooting star,solar system,black hole,time machine,jigsaw puzzle,chess board,rubik cube,crossword,escalator,revolving door,diving board,ski lift,cricket bat,wicket keeper,electric guitar,hot dog,spider web,bee hive,fishing rod,sewing machine,roller skates,bunk bed,swiss army knife,pencil sharpener,rocking chair,grandfather clock,wedding cake,fortune teller,crystal ball,bermuda triangle'.split(',');
export const COLORS = [
  '#000000', '#4b5563', '#9ca3af', '#ffffff', '#7f1d1d', '#e53935', '#fb8c00', '#fdd835', '#a3e635', '#43a047',
  '#0d9488', '#06b6d4', '#1e88e5', '#1e3a8a', '#8e24aa', '#ec407a', '#f9a8d4', '#6d4c41', '#d4a373', '#fde68a',
];
export const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
export const mask = (w: string, rev: number[]) =>
  w.split('').map((c, i) => (c === ' ' ? ' ' : rev.includes(i) ? c : '_')).join(' ');

export const avatar = (n: string) => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 65% 50%)`; };

const lev = (a: string, b: string) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
/** "Close" = exactly one edit away from the secret word. */
export const near = (g: string, w: string) => w.length >= 4 && lev(g, w) === 1;

export const beep = (f: number, ms = 150) => {
  try {
    const a = new AudioContext(), o = a.createOscillator(), g = a.createGain();
    o.frequency.value = f; g.gain.value = 0.07; o.connect(g); g.connect(a.destination);
    o.start(); o.stop(a.currentTime + ms / 1000);
  } catch { /* audio not available */ }
};

/** Compare guesses ignoring case, spaces and punctuation: "cricketBat" matches "cricket bat". */
export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
export const pickN = <T,>(a: T[], n: number): T[] => [...a].sort(() => Math.random() - 0.5).slice(0, n);
