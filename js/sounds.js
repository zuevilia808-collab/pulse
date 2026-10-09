// Библиотека звуков «Пульса». У каждого инструмента несколько тембров, а наборы собирают их под жанр.
// Звук — это параметры синтеза: движок (engine.js) строит из них удар или ноту. Сэмплов нет.

export const IDS = ['kick', 'clap', 'hat', 'ohat', 'perc', 'bass', 'stab', 'lead'];

// v — рисунок, который подходит звуку, если дорожка пустая.
export const SOUNDS = {
  kick: {
    k909: { name: '909', desc: 'классика техно, упругая', p: { tune: 46, decay: 0.42, drive: 0.25, click: 0.5, sweep: 6, bend: 0.12, hold: 0.3 } },
    kpunch: { name: 'Панч', desc: 'короткая и плотная', p: { tune: 56, decay: 0.24, drive: 0.45, click: 0.9, sweep: 7, bend: 0.05, hold: 0.35 } },
    kdeep: { name: 'Глубокая', desc: 'мягкая, для даба и минимала', p: { tune: 50, decay: 0.32, drive: 0.06, click: 0.15, sweep: 4, bend: 0.09, hold: 0.2, tone: 700 } },
    khard: { name: 'Хард', desc: 'жёсткая, с перегрузом', p: { tune: 52, decay: 0.34, drive: 1, click: 1, sweep: 10, bend: 0.06, hold: 0.45 } },
    kind: { name: 'Индастриал', desc: 'грязная, с шумом', p: { tune: 44, decay: 0.5, drive: 0.9, click: 0.8, sweep: 6, bend: 0.1, hold: 0.35, grit: 0.6 } },
    k808: { name: '808', desc: 'длинный гулкий бум', p: { tune: 44, decay: 1.1, drive: 0.3, click: 0.05, sweep: 2.6, bend: 0.07, hold: 0.1 } },
    khouse: { name: 'Хаус', desc: 'круглая и тёплая', p: { tune: 50, decay: 0.38, drive: 0.12, click: 0.35, sweep: 5, bend: 0.1, hold: 0.32, tone: 5000 } },
    kboom: { name: 'Бум', desc: 'перегруженная 808 для витч-хауса', p: { tune: 40, decay: 1.4, drive: 0.65, click: 0.2, sweep: 3, bend: 0.09, hold: 0.2 } },
  },
  clap: {
    c909: { name: '909', desc: 'классический техно-клэп', p: { tone: 1200, decay: 0.22, bursts: 3, spread: 0.0105, q: 1.1, hp: 600, body: 0 } },
    c808: { name: '808', desc: 'мягкий, с размытым хлопком', p: { tone: 1000, decay: 0.3, bursts: 4, spread: 0.012, q: 0.9, hp: 500, body: 0 } },
    csnare: { name: 'Снейр', desc: 'малый барабан с телом', p: { tone: 1800, decay: 0.18, bursts: 0, q: 0.6, hp: 300, body: 0.7, bodyF: 190 } },
    crim: { name: 'Римшот', desc: 'короткий сухой щелчок', p: { tone: 2400, decay: 0.05, bursts: 0, q: 2, hp: 900, body: 0.8, bodyF: 480 } },
    csnap: { name: 'Снэп', desc: 'щелчок пальцами', p: { tone: 2800, decay: 0.08, bursts: 1, q: 1.4, hp: 1500, body: 0 } },
    cind: { name: 'Индастриал', desc: 'металлический, с хвостом', p: { tone: 1500, decay: 0.4, bursts: 2, q: 3, hp: 700, body: 0, rev: 0.5 } },
    ctrap: { name: 'Трэп', desc: 'снейр в большом зале', p: { tone: 2200, decay: 0.25, bursts: 0, q: 0.5, hp: 400, body: 0.5, bodyF: 220, rev: 0.55 } },
  },
  hat: {
    h909: { name: '909', desc: 'яркий, с металлом', p: { tone: 8000, decay: 0.045, metal: 0.16, noise: 0.5, q: 0.9, att: 0 } },
    h808: { name: '808', desc: 'мягкий и короткий', p: { tone: 7000, decay: 0.035, metal: 0.22, noise: 0.25, q: 1.2, att: 0 } },
    hnoise: { name: 'Шумовой', desc: 'сухой шорох для минимала', p: { tone: 9000, decay: 0.03, metal: 0, noise: 0.8, q: 0.7, att: 0 } },
    hshaker: { name: 'Шейкер', desc: 'мягкий, с плавной атакой', p: { tone: 6000, decay: 0.06, metal: 0, noise: 0.6, q: 0.5, att: 0.012 } },
    hmetal: { name: 'Металл', desc: 'звенящий, для харда', p: { tone: 6500, decay: 0.06, metal: 0.35, noise: 0.3, q: 2.5, att: 0 } },
    htrap: { name: 'Трэп', desc: 'очень короткий, для дроби', p: { tone: 9500, decay: 0.025, metal: 0.2, noise: 0.45, q: 1, att: 0 } },
  },
  ohat: {
    o909: { name: '909', desc: 'открытый хэт техно', p: { tone: 7500, decay: 0.28, metal: 0.16, noise: 0.5, q: 0.9, att: 0 } },
    o808: { name: '808', desc: 'длинный и мягкий', p: { tone: 6800, decay: 0.4, metal: 0.22, noise: 0.25, q: 1.2, att: 0 } },
    onoise: { name: 'Шумовой', desc: 'шипящий, без металла', p: { tone: 8500, decay: 0.3, metal: 0, noise: 0.8, q: 0.7, att: 0 } },
    oride: { name: 'Райд', desc: 'звенящая тарелка', p: { tone: 5200, decay: 0.9, metal: 0.4, noise: 0.15, q: 3, att: 0 } },
  },
  perc: {
    ptom: { name: 'Томы', desc: 'бонги и томы', p: { tune: 520, decay: 0.1, wave: 'triangle', ratios: [1, 1.335, 0.75, 1.5], drop: 1.6, noise: 0.4, pair: 0, band: 0 } },
    pconga: { name: 'Конга', desc: 'тёплая, живая', p: { tune: 330, decay: 0.16, wave: 'sine', ratios: [1, 1.5, 1.2, 1], drop: 1.3, noise: 0.2, pair: 0, band: 0 } },
    pblip: { name: 'Блип', desc: 'короткий электронный писк', p: { tune: 1200, decay: 0.05, wave: 'sine', ratios: [1, 1.5, 0.75, 2], drop: 3, noise: 0, pair: 0, band: 0 } },
    pcow: { name: 'Ковбелл', desc: 'колокольчик 808', p: { tune: 540, decay: 0.14, wave: 'square', ratios: [1, 1, 1, 1], drop: 1, noise: 0, pair: 1.48, band: 1.6 } },
    pmetal: { name: 'Металл', desc: 'лязг для индастриала', p: { tune: 900, decay: 0.12, wave: 'square', ratios: [1, 1.41, 0.71, 1.19], drop: 1.1, noise: 0.6, pair: 2.76, band: 2 } },
    pchime: { name: 'Колокольчик', desc: 'холодный звон с эхом', p: { tune: 880, decay: 0.5, wave: 'sine', ratios: [1, 1.2, 0.8, 1.5], drop: 1, noise: 0, pair: 3.5, band: 0, rev: 0.5 } },
  },
  bass: {
    broll: { name: 'Роллинг', desc: 'плотный техно-бас', p: { wave: 'sawtooth', cutoff: 320, res: 4, env: 0.3, decay: 0.12, drive: 0.35, osc2: 0, det: 0, sub: 0.35, glide: 0.025, rel: 0.012 } },
    b303: { name: '303', desc: 'кислотный, визжит фильтром', v: 'acid', p: { wave: 'sawtooth', cutoff: 380, res: 14, env: 0.75, decay: 0.22, drive: 0.45, osc2: 0, det: 0, sub: 0, glide: 0.025, rel: 0.012 } },
    b303q: { name: '303 квадрат', desc: 'кислотный, но полый', v: 'acid', p: { wave: 'square', cutoff: 420, res: 16, env: 0.7, decay: 0.2, drive: 0.5, osc2: 0, det: 0, sub: 0, glide: 0.025, rel: 0.012 } },
    bsub: { name: 'Саб', desc: 'чистый глубокий низ', p: { wave: 'sine', cutoff: 220, res: 1, env: 0.1, decay: 0.2, drive: 0.1, osc2: 0, det: 0, sub: 0.25, glide: 0.025, rel: 0.02 } },
    bsquare: { name: 'Квадрат', desc: 'полый, для минимала', p: { wave: 'square', cutoff: 300, res: 3, env: 0.25, decay: 0.15, drive: 0.2, osc2: 0, det: 0, sub: 0.2, glide: 0.025, rel: 0.012 } },
    breese: { name: 'Риз', desc: 'две расстроенные пилы, рычит', p: { wave: 'sawtooth', cutoff: 700, res: 2, env: 0.2, decay: 0.3, drive: 0.6, osc2: 0.9, det: 18, sub: 0.3, glide: 0.03, rel: 0.02 } },
    bhouse: { name: 'Хаус', desc: 'круглый, прыгает по октавам', v: 'house', p: { wave: 'sawtooth', cutoff: 520, res: 2, env: 0.35, decay: 0.14, drive: 0.12, osc2: 0, det: 0, sub: 0.45, glide: 0.02, rel: 0.03 } },
    b808: { name: '808', desc: 'гудящий бас с глайдом', v: '808', p: { wave: 'sine', cutoff: 1200, res: 1, env: 0, decay: 0.3, drive: 0.55, osc2: 0, det: 0, sub: 0, glide: 0.06, rel: 0.08 } },
  },
  stab: {
    sdub: { name: 'Даб-аккорд', desc: 'короткий, тонет в эхе', p: { wave: 'sawtooth', cutoff: 1700, res: 2, decay: 0.22, attack: 0.004, env: 2.2, det: 9, chord: 'seventh', oct: 0, hold: 0.4, gain: 1 } },
    spluck: { name: 'Плак', desc: 'щипок, короткий и яркий', p: { wave: 'sawtooth', cutoff: 1800, res: 4, decay: 0.08, attack: 0.002, env: 3, det: 6, chord: 'triad', oct: 0, hold: 0.4, gain: 1 } },
    sorgan: { name: 'Орган', desc: 'детройтские аккорды', p: { wave: 'square', cutoff: 2600, res: 1, decay: 0.15, attack: 0.004, env: 1.3, det: 4, chord: 'seventh', oct: 0, hold: 0.4, gain: 0.9 } },
    srave: { name: 'Рейв', desc: 'широкий стаб из 90-х', p: { wave: 'sawtooth', cutoff: 3000, res: 3, decay: 0.25, attack: 0.002, env: 1.8, det: 22, chord: 'fifth', oct: 0, hold: 0.4, gain: 1 } },
    skeys: { name: 'Клавиши', desc: 'пиано-аккорды хауса', p: { wave: 'triangle', cutoff: 3400, res: 1, decay: 0.3, attack: 0.002, env: 2.6, det: 3, chord: 'seventh', oct: 0, hold: 0.25, gain: 1.45 } },
    spad: { name: 'Мрачный пэд', desc: 'тянется, медленно вступает', v: 'pad', p: { wave: 'sawtooth', cutoff: 900, res: 1, decay: 0.9, attack: 0.25, env: 1.2, det: 14, chord: 'triad', oct: 0, hold: 99, gain: 1.1 } },
    schoir: { name: 'Хор', desc: 'призрачные голоса', v: 'pad', p: { wave: 'triangle', cutoff: 1800, res: 1, decay: 1.2, attack: 0.4, env: 1, det: 10, chord: 'triad', oct: 1, hold: 99, gain: 1.6 } },
  },
  lead: {
    lsaw: { name: 'Пила', desc: 'яркая синт-мелодия', p: { wave: 'sawtooth', cutoff: 2400, res: 3, decay: 0.28, attack: 0.005, det: 7, fm: 0, fmr: 2, vib: 0, rel: 0.03, gain: 1 } },
    lsquare: { name: 'Квадрат', desc: 'полая, как в старых синтах', p: { wave: 'square', cutoff: 2000, res: 2, decay: 0.2, attack: 0.005, det: 4, fm: 0, fmr: 2, vib: 0, rel: 0.03, gain: 0.9 } },
    lpluck: { name: 'Плак', desc: 'короткий щипок', p: { wave: 'sawtooth', cutoff: 1500, res: 6, decay: 0.1, attack: 0.003, det: 3, fm: 0, fmr: 2, vib: 0, rel: 0.03, gain: 1 } },
    lsine: { name: 'Синус', desc: 'чистая и мягкая', p: { wave: 'sine', cutoff: 8000, res: 0.7, decay: 0.4, attack: 0.008, det: 0, fm: 0, fmr: 2, vib: 0, rel: 0.05, gain: 1.5 } },
    lbell: { name: 'Колокол', desc: 'стеклянный звон', p: { wave: 'sine', cutoff: 8000, res: 0.7, decay: 0.8, attack: 0.003, det: 0, fm: 3, fmr: 3.5, vib: 0, rel: 0.5, gain: 1.4 } },
    lghost: { name: 'Призрак', desc: 'плывущий, для витч-хауса', v: 'slow', p: { wave: 'triangle', cutoff: 2500, res: 1, decay: 0.6, attack: 0.06, det: 20, fm: 0, fmr: 2, vib: 18, rel: 0.3, gain: 1.5 } },
  },
};

const kit = (name, desc, list) => ({ name, desc, s: Object.fromEntries(IDS.map((id, i) => [id, list[i]])) });

// Порядок звуков в наборе: бочка, клэп, хэт, открытый хэт, перкуссия, бас, аккорды, мелодия.
export const KITS = {
  techno: kit('Техно 909', 'классика пик-тайма', ['k909', 'c909', 'h909', 'o909', 'ptom', 'broll', 'sdub', 'lsaw']),
  acid: kit('Эсид 303', 'кислотный бас и 909', ['k909', 'c909', 'h909', 'o909', 'pblip', 'b303', 'spluck', 'lsquare']),
  k808: kit('Классика 808', 'мягкие удары и ковбелл', ['k808', 'c808', 'h808', 'o808', 'pcow', 'b808', 'sorgan', 'lsquare']),
  minimal: kit('Минимал', 'сухо и точно', ['kdeep', 'crim', 'hnoise', 'onoise', 'pblip', 'bsquare', 'spluck', 'lsine']),
  dub: kit('Даб', 'мягко и глубоко', ['kdeep', 'csnap', 'hshaker', 'onoise', 'pconga', 'bsub', 'sdub', 'lsine']),
  detroit: kit('Детройт', 'органные аккорды', ['k909', 'c909', 'h909', 'o909', 'pcow', 'bsquare', 'sorgan', 'lsquare']),
  hypnotic: kit('Гипнотик', 'плотно и тёмно', ['kpunch', 'crim', 'hnoise', 'oride', 'pconga', 'bsub', 'sdub', 'lpluck']),
  melodic: kit('Мелодик', 'пэды и колокол', ['kpunch', 'c808', 'h909', 'o909', 'pblip', 'broll', 'spad', 'lbell']),
  industrial: kit('Индастриал', 'грязь и металл', ['kind', 'cind', 'hmetal', 'oride', 'pmetal', 'breese', 'srave', 'lsaw']),
  hard: kit('Хард', 'перегруз и рейв', ['khard', 'c909', 'hmetal', 'o909', 'pmetal', 'breese', 'srave', 'lsaw']),
  witch: kit('Witch House', '808, хор и призраки', ['kboom', 'ctrap', 'htrap', 'o808', 'pchime', 'b808', 'schoir', 'lghost']),
  house: kit('Хаус', 'клавиши, шейкер, конги', ['khouse', 'c909', 'hshaker', 'o909', 'pconga', 'bhouse', 'skeys', 'lbell']),
};
export const KIT_IDS = Object.keys(KITS);

// Какой набор сейчас собран (или null, если звуки выбраны вручную).
export function kitOf(tracks) {
  return KIT_IDS.find(k => IDS.every(id => tracks[id].sound === KITS[k].s[id])) || null;
}

// Слова, по которым голосом выбирается набор или звук.
export const KIT_WORDS = [
  ['witch', 'вич|витч|witch|ведьм'], ['house', 'хаус|house'], ['k808', '808'], ['acid', 'есид|асид|acid|303|кислот'], ['minimal', 'минимал'],
  ['dub', 'даб|dub'], ['detroit', 'детройт'], ['hypnotic', 'гипно'], ['melodic', 'мелодик'],
  ['industrial', 'индаст|индуст'], ['hard', 'хард|hard'], ['techno', 'техно|909'],
];

export const SOUND_WORDS = {
  kick: [['k808', '808'], ['k909', '909'], ['khard', 'хард|hard'], ['kind', 'индаст|индуст|грязн'], ['kdeep', 'глубок|дип'], ['kpunch', 'панч|punch|плотн'], ['kboom', 'бум|вич|витч|witch'], ['khouse', 'хаус|house']],
  clap: [['c808', '808'], ['c909', '909'], ['csnare', 'снейр|снер|малы|snare'], ['crim', 'рим|rim'], ['csnap', 'снеп|щелч|snap'], ['cind', 'индаст|индуст|металл'], ['ctrap', 'треп|трап|trap|вич|витч']],
  hat: [['h808', '808'], ['h909', '909'], ['hnoise', 'шум'], ['hshaker', 'шейкер|shaker'], ['hmetal', 'металл|звон'], ['htrap', 'треп|трап|trap|вич|витч']],
  ohat: [['o808', '808'], ['o909', '909'], ['onoise', 'шум'], ['oride', 'райд|ride|тарелк']],
  perc: [['pcow', 'ковбел|808'], ['ptom', 'том|бонг'], ['pconga', 'конг'], ['pblip', 'блип|писк'], ['pmetal', 'металл|лязг'], ['pchime', 'колокольч|звон']],
  bass: [['b808', '808'], ['b303q', '303 квадрат|квадратн\\S* 303'], ['b303', '303|кислот|есид|асид'], ['bsub', 'саб|sub'], ['bsquare', 'квадрат'], ['breese', 'риз|reese|рычащ'], ['broll', 'роллинг|катящ'], ['bhouse', 'хаус|house']],
  stab: [['skeys', 'пиано|пианин|рояль|родес|rhodes|piano|хаус|house'], ['spad', 'пед|пэд|pad|мрачн'], ['schoir', 'хор|голос'], ['sorgan', 'орган'], ['spluck', 'плак|щипок|pluck'], ['srave', 'рейв|rave'], ['sdub', 'даб|dub']],
  lead: [['lbell', 'колокол|bell'], ['lghost', 'призрак|ghost|вич|витч'], ['lsine', 'синус|sine'], ['lsquare', 'квадрат'], ['lpluck', 'плак|щипок|pluck'], ['lsaw', 'пил[аы]|saw']],
};
