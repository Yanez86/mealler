// SPDX-License-Identifier: AGPL-3.0-or-later
// Food categories for the colored icons: guessed from what the user wrote (Italian or English),
// never stored. Keywords are compared with accents removed. A keyword ending in '*' matches any
// word that starts with it, any other keyword only whole words; '_' joins the words of a
// multi-word keyword. The food named first wins ("pasta e fagioli" is pasta); at the same
// position the longest keyword wins ("frutta secca" beats "frutta", "aranciata" beats "aranc*").

import type { EstimateItem } from './types.ts';

export const FOOD_CATEGORIES = [
  'fruit',
  'vegetables',
  'legumes',
  'bread',
  'pasta',
  'pizza',
  'meat',
  'fish',
  'eggs',
  'dairy',
  'nuts',
  'fats',
  'sweets',
  'coffee',
  'drinks',
  'alcohol',
  'other'
] as const;
export type FoodCategory = (typeof FOOD_CATEGORIES)[number];

const KEYWORDS: Record<Exclude<FoodCategory, 'other'>, string> = {
  fruit: `mela mele pera pere banan* aranc* mandarin* clementin* kiwi fragol* uva pesca pesche
    albicocc* cilieg* anguria angurie cocomero melone meloni ananas mango manghi papaya frutto frutta
    frutti frutti_di_bosco macedonia mirtill* lampon* prugn* susin* fico fichi cachi kaki melograno
    melagrana pompelm* limone limoni lime avocado datteri dattero ribes uvetta insalata_di_frutta
    apple* pear pears banana* orange oranges tangerine* strawberr* grape grapes peach* apricot* cherr*
    watermelon* melon* pineapple* berry berries blueberr* raspberr* plum plums fig figs fruit* lemon*`,
  vegetables: `insalat* lattug* rucola spinac* verdur* zucchin* melanzan* peperon* pomodor* carot*
    broccol* cavol* verza finocch* carciof* asparag* fagiolin* funghi fungo porcini champignon cipoll*
    sedano cetriol* radicchio bietol* zucca zucche minestrone contorn* patat* cicoria scarola indivia
    porri porro rape ravanell* cime_di_rapa friarielli ortagg* caponata pinzimonio gazpacho valeriana
    songino germogli
    salad* lettuce spinach courgette* eggplant* aubergine* tomato* carrot* broccoli cabbage* cauliflower*
    asparagus mushroom* onion* celery cucumber* kale vegetable* veggie* potato* fries pumpkin* squash
    leek* beet* radish* artichoke* green_beans`,
  legumes: `legum* fagiol* ceci cece lenticch* piselli pisello fave fava soia edamame lupini tofu hummus
    cicerchi* borlotti cannellini falafel tempeh
    bean beans chickpea* lentil* pea peas soy soya soybean*`,
  bread: `pane panin* pan_carre pancarre focacc* piadin* cracker* grissin* fette_biscottate
    fetta_biscottata toast tramezzin* bruschett* crostin* tarall* frisell* schiacciata ciabatta rosetta
    michetta baguette tigell* gallett* cereali muesli avena fiocchi_d_avena porridge granola corn_flakes
    cornflakes torta_salata quiche
    bread sandwich* bagel* wrap wraps pita tortilla* rice_cake* cereal* oat oats oatmeal`,
  pasta: `pasta pastasciutta pastina spaghett* penne fusilli rigatoni maccheroni linguine tagliatell*
    tagliolini fettuccine pappardelle tortellin* tortelloni cappellett* agnolotti ravioli lasagn* gnocch*
    riso risott* paella cous_cous couscous farro orzo quinoa polenta orecchiette trofie paccheri bucatini
    mezze_maniche cannelloni carbonara amatriciana gricia cacio_e_pepe ramen noodle* udon vermicelli
    pici bigoli strozzapreti ditalini minestra pizzoccheri arancin* suppli
    insalata_di_riso insalata_di_pasta insalata_di_farro
    rice macaroni`,
  pizza: `pizz* calzone panzerott* pinsa`,
  meat: `carne carni poll* tacchino manzo vitello vitella maiale suino bistecc* hamburger* burger*
    polpett* salsicc* cotolett* arrost* agnello coniglio scaloppin* fettin* ragu bollito brasato
    spezzatino wurstel kebab gyros prosciutt* salame salami bresaola mortadella speck pancetta
    guanciale lonza porchetta cotechino zampone salum* affettat* roast_beef straccetti
    ossobuco involtini cinghiale anatra faraona tagliata hot_dog insalata_di_pollo galletto
    chicken beef pork steak* meatball* sausage* lamb turkey bacon ham meat* veal duck nugget* ribs`,
  fish: `pesce pesci salmon* tonno merluzz* orata orate branzino spigola sgombro alici acciug* sardin*
    gamber* scamp* calamar* polpo polipo seppi* cozze vongole frutti_di_mare baccala stoccafisso trota
    sushi sashimi uramaki nigiri poke surimi aringa aringhe platessa sogliola nasello dentice cernia
    ostric* crostace* aragost* granchi* totani bastoncini_di_pesce insalata_di_mare
    insalata_di_polpo
    tuna cod shrimp* prawn* squid octopus mussel* clam* seafood fish* sardine* anchov* crab* lobster*
    trout mackerel`,
  eggs: `uovo uova frittat* omelett* albume albumi tuorl*
    egg eggs omelet*`,
  dairy: `latte latticin* yogurt* yoghurt* formagg* mozzarell* parmigian* grana ricotta stracchino
    gorgonzola pecorino burrata scamorza provola fontina asiago emmental* feta brie camembert crescenza
    robiola mascarpone kefir skyr fiocchi_di_latte philadelphia caciotta provolone taleggio
    caprino quark panna caciocavallo bufala fior_di_latte
    cheese* milk* cheddar cream_cheese cottage_cheese`,
  nuts: `frutta_secca frutta_a_guscio noci noce mandorl* nocciol* pistacch* arachid* anacard* pinoli
    semi seme chia macadamia burro_di_arachidi noci_pecan
    nut nuts almond* walnut* hazelnut* peanut* cashew* pistachio* seeds peanut_butter`,
  fats: `olio burro margarina maionese strutto lardo ghee ketchup senape salsa salse sugo pesto
    condiment* aceto
    oil butter mayo mayonnaise mustard sauce* dressing`,
  sweets: `dolce dolci dolcett* torta torte biscott* cioccolat* gelat* cornett* brioche
    croissant* merendin* crostat* tiramisu nutella nocciolata marmellat* confettur* miele zucchero
    caramell* budino budini pandoro panettone colomba pasticcin* cannol* sfogliatell* ciambell* krapfen
    bombolon* muffin* plumcake pan_di_spagna crema_pasticcera panna_cotta pannacotta semifreddo sorbetto granita
    cheesecake crepe* pancake* waffle* wafer cantucci amaretti savoiardi frollin* mousse profiteroles
    baba zeppol* chiacchiere struffoli cassata strudel pasta_frolla sbrisolona dessert*
    cake* cookie* chocolate* ice_cream candy candies donut* doughnut* pastry pastries jam honey sugar
    brownie* pie cupcake*`,
  coffee: `caffe caffellatte caffelatte espresso cappuccin* macchiato latte_macchiato marocchino
    mocaccino ginseng decaffeinato te tisana tisane infuso camomilla matcha chai
    coffee* tea herbal_tea`,
  drinks: `acqua succo succhi spremut* bibit* aranciata limonata coca_cola cola gassosa chinotto
    te_freddo the_freddo frullat* smoothie* centrifugat* estratto bevand* acqua_tonica kombucha
    milkshake frappe
    water juice* orange_juice apple_juice soda lemonade coke iced_tea shake drink*`,
  alcohol: `vino vini birra birre spritz aperol cocktail* prosecco spumante champagne amaro grappa
    liquore limoncello whisky whiskey vodka gin rum negroni mojito sangria sidro martini bellini
    wine beer* cider alcohol`
};

interface Keyword {
  text: string;
  prefix: boolean;
  category: FoodCategory;
}

const ALL: Keyword[] = Object.entries(KEYWORDS).flatMap(([category, list]) =>
  list
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => {
      const prefix = raw.endsWith('*');
      const text = (prefix ? raw.slice(0, -1) : raw).replace(/_/g, ' ');
      return { category: category as FoodCategory, prefix, text };
    })
);

/** Lowercase, no accents, words separated by single spaces ("Caffè d'orzo" becomes "caffe d orzo"). */
export function normalizeFoodText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const cache = new Map<string, FoodCategory>();

/** The category of a food or meal description; 'other' when nothing is recognized. */
export function foodCategory(text: string | null | undefined): FoodCategory {
  if (!text) return 'other';
  const norm = normalizeFoodText(text);
  const cached = cache.get(norm);
  if (cached) return cached;
  const padded = ` ${norm} `;
  let best: { at: number; length: number; category: FoodCategory } | null = null;
  for (const k of ALL) {
    const at = padded.indexOf(k.prefix ? ` ${k.text}` : ` ${k.text} `);
    if (at < 0) continue;
    if (!best || at < best.at || (at === best.at && k.text.length > best.length)) {
      best = { at, length: k.text.length, category: k.category };
    }
  }
  const category = best?.category ?? 'other';
  if (cache.size > 500) cache.clear();
  cache.set(norm, category);
  return category;
}

/**
 * The category of a diary entry, favorite or product: the first text that is recognized,
 * otherwise the estimated item with the most calories.
 */
export function mealCategory(texts: (string | null | undefined)[], items?: EstimateItem[] | null): FoodCategory {
  for (const text of texts) {
    const category = foodCategory(text);
    if (category !== 'other') return category;
  }
  const ranked = [...(items ?? [])].sort((a, b) => (b.kcal ?? 0) - (a.kcal ?? 0));
  for (const item of ranked) {
    const category = foodCategory(item.name);
    if (category !== 'other') return category;
  }
  return 'other';
}
