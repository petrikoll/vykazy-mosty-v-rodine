export const PROJECT = {
  id: "mosty-v-rodine",
  shortName: "MOSTY_ROD",
  name: "Mosty v rodině",
  englishName: "Family Bridges",
  regNumber: "CZ.03.02.02/00/25_104/0006461",
  program: "Operační program Zaměstnanost plus",
  call: "03_25_104 - Podpora služeb pro ohrožené děti, rodiny a mladé dospělé",
  organization: "Rodinné, komunitní a vzdělávací centrum Emcéčko, z.s.",
  organizationId: "70238952",
  legalForm: "spolek",
  address: "J. K. Tyla 418, 757 01 Valašské Meziříčí",
  statutoryRepresentative: "Silvie Malíková",
  realizationPlace: "Zlínský kraj, zejména ORP Valašské Meziříčí",
  startDate: "2026-05-01",
  endDate: "2028-08-31",
  realizationPeriod: "1. 5. 2026 - 31. 8. 2028",
  durationMonths: 28,
};

export const KEY_ACTIVITIES = [
  { id: "KA1", name: "Poskytování sociálně aktivizačních služeb pro rodiny s dětmi (SAS RD)" },
  { id: "KA2", name: "Systémová podpora multidisciplinarity a casemanagementu" },
  { id: "KA3", name: "Činnosti nad rámec základních činností SAS" },
  { id: "KA4", name: "Podpora odborných pracovníků - vzdělávání a supervize" },
  { id: "KA5", name: "Evaluace" },
];

const ftePosition = (position) => ({
  allocationType: "fte",
  contractType: "PS",
  reportRequired: true,
  active: true,
  ...position,
});

const hourlyPosition = (position) => ({
  allocationType: "hours",
  reportRequired: true,
  active: true,
  ...position,
});

const flatRatePosition = (position) => ({
  allocationType: "flat-rate",
  reportRequired: false,
  active: true,
  ...position,
});

export const POSITIONS = [
  ftePosition({
    id: "service-manager",
    name: "Vedoucí služby/programu",
    exportRoleName: "Vedouci_sluzby_programu",
    budgetCode: "1.1.1.3",
    fte: 0.2,
    accessRole: "director",
    allocations: { KA1: 0.05, KA2: 0.1, KA3: 0.03, KA4: 0.01, KA5: 0.01 },
    activities: [
      "Vedení a koordinace činností jednotlivých složek služby a multidisciplinárního týmu, včetně řízení pracovní zátěže a zajištění kontinuity péče.",
      "Sjednocování metodických postupů, kontrola kvality a auditní správnosti činností projektu a koordinace spolupráce s OSPOD a dalšími aktéry.",
      "Organizace vzdělávání, supervizí a aktivit KA3, kontrola evidence a zajištění podkladů pro evaluaci a průběžné zvyšování kvality služby.",
    ],
  }),
  ftePosition({
    id: "expert-guarantor",
    name: "Odborný garant",
    exportRoleName: "Odborny_garant",
    budgetCode: "1.1.1.4",
    fte: 0.2,
    accessRole: "manager",
    allocations: { KA1: 0.1, KA2: 0.1 },
    activities: [
      "Odborné posuzování složitějších klientských situací a poskytování metodické podpory sociálnímu pracovníkovi při práci s kumulovanými obtížemi rodin.",
      "Kontrola souladu postupů pracovníků s metodikou služby, standardy kvality sociálních služeb a vymezením základních činností SAS RD.",
      "Zpracování odborných stanovisek k aktivitám a výstupům projektu, vyhodnocování rizik a doporučování bezpečných a auditně doložitelných postupů.",
    ],
  }),
  ftePosition({
    id: "social-worker",
    name: "Sociální pracovník",
    exportRoleName: "Socialni_pracovnik",
    budgetCode: "1.1.1.2",
    fte: 0.8,
    allocations: { KA1: 0.8 },
    activities: [
      "Provádění sociálního šetření, individuálního plánování a vedení dokumentace klientských rodin v rámci sociálně aktivizační služby.",
      "Terénní a ambulantní nácvik rodičovských, sociálních, finančních a praktických dovedností a podpora stabilizace rodinné situace.",
      "Doprovázení a podpora při jednání s OSPOD, Úřadem práce, školami a dalšími institucemi se zaměřením na postupné osamostatnění rodiny.",
    ],
  }),
  ftePosition({
    id: "psychologist",
    name: "Psycholog",
    exportRoleName: "Psycholog",
    budgetCode: "1.1.1.1",
    fte: 1,
    allocations: { KA1: 1 },
    activities: [
      "Poskytování intenzivního podpůrného poradenství a krizové intervence v rámci sociálně terapeutických činností SAS RD.",
      "Práce s dětmi a rodinami zatíženými traumatem, konflikty a emočními či behaviorálními obtížemi, včetně odborného vyhodnocení potřeb.",
      "Spolupráce s multidisciplinárním týmem při plánování podpory a vyhodnocování změn v psychické zátěži a rodinné komunikaci.",
    ],
  }),
  ftePosition({
    id: "mediator",
    name: "Mediátor",
    exportRoleName: "Mediator",
    budgetCode: "1.1.1.7",
    fte: 0.5,
    allocations: { KA1: 0.5 },
    activities: [
      "Vedení mediačně zaměřených konzultací s rodinami a podpora bezpečné komunikace se zřetelem k potřebám dítěte.",
      "Nácvik konstruktivního řešení akutních i dlouhodobých rodinných konfliktů a předcházení jejich eskalaci.",
      "Podpora rodičů při uzavírání praktických dohod o péči, předávání informací a každodenním fungování rodiny.",
    ],
  }),
  ftePosition({
    id: "case-manager",
    name: "Casemanager",
    exportRoleName: "Casemanager",
    budgetCode: "1.1.1.5",
    fte: 0.3,
    allocations: { KA2: 0.3 },
    activities: [
      "Monitorování, vyhodnocování a aktualizace individuálních plánů klientských rodin a řízení jejich formální revize nejméně jednou za tři měsíce.",
      "Koordinace procesu podpory, odpovědností členů multidisciplinárního týmu a návaznosti intervencí na cíle individuálního plánu.",
      "Vytváření a koordinace podpůrných sítí a spolupráce s OSPOD, školami, úřady a dalšími aktéry včetně provázanosti s IPOD.",
    ],
  }),
  hourlyPosition({
    id: "therapist",
    name: "Terapeut",
    exportRoleName: "Terapeut",
    budgetCode: "1.1.2.1",
    contractType: "DPČ",
    monthlyHours: 12,
    allocations: { KA1: 12 },
    activities: [
      "Poskytování specializované krizové a podpůrné intervence klientům s emočními a behaviorálními obtížemi v rámci sociálně terapeutických činností.",
      "Podpora stabilizace rodinných vztahů a zvládání traumatické zátěže v rozsahu vymezeném službou SAS RD.",
      "Odborné konzultace s multidisciplinárním týmem k návaznosti terapeutické podpory na individuální plán rodiny.",
    ],
  }),
  hourlyPosition({
    id: "lawyer",
    name: "Právník",
    exportRoleName: "Pravnik",
    budgetCode: "1.1.2.2",
    contractType: "DPČ",
    monthlyHours: 5,
    allocations: { KA1: 5 },
    activities: [
      "Poskytování právních konzultací klientským rodinám v oblasti zadlužení, exekucí a procesů sociálně-právní ochrany dětí.",
      "Podpora klientů při orientaci v právní korespondenci a při uplatňování práv a oprávněných zájmů.",
      "Odborné konzultace pracovníkům projektu ke složitějším právním otázkám klientských případů.",
    ],
  }),
  hourlyPosition({
    id: "peer-consultant",
    name: "Peer konzultant",
    exportRoleName: "Peer_konzultant",
    budgetCode: "1.1.2.4",
    contractType: "DPČ",
    monthlyHours: 32,
    allocations: { KA3: 32 },
    activities: [
      "Facilitace pravidelných setkání svépomocných skupin rodin s podobnými zkušenostmi a podpora bezpečného sdílení.",
      "Individuální vrstevnická podpora klientů s využitím vlastní zkušenosti, posilování motivace a sebedůvěry.",
      "Spolupráce s týmem při volbě témat skupinových setkání a při propojování klientů s vhodnými zdroji podpory.",
    ],
  }),
  hourlyPosition({
    id: "facilitator",
    name: "Facilitátor",
    exportRoleName: "Facilitator",
    budgetCode: "1.1.3.1",
    contractType: "DPP",
    monthlyHours: 7.5,
    allocations: { KA1: 7.5 },
    activities: [
      "Příprava a facilitace případových konferencí a složitějších jednání rodiny s OSPOD a dalšími institucemi.",
      "Vedení procesu komunikace tak, aby byly srozumitelně vymezeny cíle, role, dohody a navazující kroky účastníků.",
      "Zachycení dohod a podpora jejich návaznosti na individuální plán a koordinovanou práci multidisciplinárního týmu.",
    ],
  }),
  hourlyPosition({
    id: "lecturer",
    name: "Lektor",
    exportRoleName: "Lektor",
    budgetCode: "1.1.3.2",
    contractType: "DPP",
    monthlyHours: 3,
    allocations: { KA3: 3 },
    activities: [
      "Příprava krátkých vzdělávacích a tréninkových modulů volených podle potřeb klientských rodin.",
      "Realizace praktických tréninků zaměřených například na finanční gramotnost, zdravé vaření nebo pozitivní výchovu.",
      "Ověření osvojení dovedností účastníky a zpracování stručného záznamu o průběhu a výsledcích aktivity.",
    ],
  }),
  ftePosition({
    id: "ka-cs-coordinator",
    name: "Koordinátor KA a CS",
    exportRoleName: "Koordinator_KA_a_CS",
    budgetCode: "1.1.1.6",
    fte: 0.2,
    allocations: {},
    active: false,
    reportRequired: false,
    note: "Položka je v rozpočtu projektu uvedena s nulovým počtem jednotek a nulovou částkou.",
    activities: [],
  }),
  hourlyPosition({
    id: "psychologist-hourly",
    name: "Psycholog (hodinová dohoda)",
    exportRoleName: "Psycholog_DPC",
    budgetCode: "1.1.2.3",
    contractType: "DPČ",
    monthlyHours: 10,
    allocations: {},
    active: false,
    reportRequired: false,
    note: "Položka je v rozpočtu projektu uvedena s nulovým počtem jednotek a nulovou částkou.",
    activities: [],
  }),
  flatRatePosition({ id: "evaluator", name: "Evaluátor", activities: ["Externí evaluace projektu."] }),
  flatRatePosition({ id: "supervisor", name: "Supervizor", activities: ["Externí supervize realizačního týmu."] }),
  flatRatePosition({ id: "project-financial-manager", name: "Projektový a finanční manažer", activities: ["Řízení projektu a finanční administrativa."] }),
  flatRatePosition({ id: "accountant", name: "Účetní", activities: ["Účetní agenda projektu."] }),
];

export const DEFAULT_ABSENCES = {
  vacation: 0,
  sickLeave: 0,
  otherObstacles: 0,
  otherObstaclesUnit: "days",
  doctorVisitHours: 0,
  holiday: 0,
};

// Jediná osoba známá z původní verze aplikace. Další pracovníci se zakládají
// ve správě týmu a jejich jména nejsou z projektové žádosti odvozována.
export const DEMO_EMPLOYEE = {
  id: "martina-pirkova",
  name: "Martina Pírková",
  exportName: "Martina_Pirkova",
  globalFte: 1,
  appRole: "worker",
  assignments: [
    { id: "martina-expert-guarantor", positionId: "expert-guarantor" },
    { id: "martina-case-manager", positionId: "case-manager" },
    { id: "martina-mediator", positionId: "mediator" },
  ],
};

export const getPositionById = (positionId) =>
  POSITIONS.find((position) => position.id === positionId);

export const expandEmployeeAssignments = (employee) =>
  (employee?.assignments || [])
    .map((assignment) => {
      const position = getPositionById(assignment.positionId);
      if (!position) return null;
      return {
        ...position,
        ...assignment,
        id: assignment.id || `${employee.id}-${position.id}`,
        positionId: position.id,
        positionName: position.name,
        fte: assignment.fte ?? position.fte ?? 0,
        monthlyHours: assignment.monthlyHours ?? position.monthlyHours ?? 0,
        activities: assignment.activities || position.activities || [],
      };
    })
    .filter(Boolean);

// Zpětně kompatibilní exporty pro generátor a stávající testy.
export const EMPLOYEE = DEMO_EMPLOYEE;
export const PROJECTS = { [PROJECT.id]: PROJECT };
export const ROLES = expandEmployeeAssignments(DEMO_EMPLOYEE).map((role) => ({
  ...role,
  projectId: PROJECT.id,
}));
