export const EMPLOYEE = {
  id: "martina-pirkova",
  name: "Martina Pírková",
  exportName: "Martina_Pirkova",
  globalFte: 1,
};

export const PROJECTS = {
  "mosty-v-rodine": {
    projectId: "mosty-v-rodine",
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
    realizationPeriod: "1. 5. 2026 - 31. 8. 2028",
    duration: "28 měsíců",
  },
};

export const ROLES = [
  {
    id: "odborny-garant",
    projectId: "mosty-v-rodine",
    positionId: "odborny-garant",
    positionName: "Odborný garant",
    exportRoleName: "Odborny_garant",
    fte: 0.2,
    budgetCode: "1.1.1.4",
    contractType: "PS",
    activitySetId: "odborny-garant",
    activities: [
      "Odborné posuzování složitějších klientských situací v rámci SAS RD, včetně metodického doporučení dalšího postupu při práci s rodinami s kumulovanými sociálními, vztahovými, výchovnými nebo ekonomickými obtížemi.",
      "Odborná kontrola souladu individuálních postupů pracovníků projektu s metodikou služby, standardy kvality sociálních služeb a vymezením základních činností SAS RD ve vztahu k potřebám cílové skupiny.",
      "Poskytování odborných konzultací členům multidisciplinárního týmu při vyhodnocování rizik v klientských případech, nastavování bezpečných hranic podpory a volbě vhodné odborné intervence pro dítě a rodinu.",
    ],
  },
  {
    id: "case-manager",
    projectId: "mosty-v-rodine",
    positionId: "case-manager",
    positionName: "Case manager",
    exportRoleName: "Case_manager",
    fte: 0.3,
    budgetCode: "1.1.1.5",
    contractType: "PS",
    activitySetId: "case-manager",
    activities: [
      "Koordinace procesu podpory klientské rodiny v rámci case managementu, včetně sledování návaznosti jednotlivých intervencí, odpovědností zapojených pracovníků a směřování podpory k cílům individuálního plánu.",
      "Pravidelné vyhodnocování a aktualizace individuálního plánu klientské rodiny na základě zjištěných potřeb, dosažených změn a objektivních ukazatelů pokroku při stabilizaci rodinné situace.",
      "Propojování podpory poskytované multidisciplinárním týmem s návaznou sítí služeb a institucí, zejména OSPOD, školami, úřady a dalšími aktéry, tak aby byla podpora rodiny koordinovaná, srozumitelná a vzájemně provázaná.",
    ],
  },
  {
    id: "mediator",
    projectId: "mosty-v-rodine",
    positionId: "mediator",
    positionName: "Mediátor",
    exportRoleName: "Mediator",
    fte: 0.5,
    budgetCode: "1.1.1.7",
    contractType: "PS",
    activitySetId: "mediator",
    activities: [
      "Vedení mediačně zaměřených konzultací s rodinou v rámci sociálně terapeutických činností SAS RD, se zaměřením na podporu vzájemné komunikace, porozumění potřebám dítěte a posilování schopnosti rodiny řešit náročné situace dohodou.",
      "Nácvik konstruktivního řešení sporů a napětí v rodině, včetně podpory bezpečné komunikace, nastavování pravidel spolupráce a předcházení eskalaci konfliktů v rodinném prostředí.",
      "Podpora rodičů a dalších členů rodiny při hledání praktických dohod o každodenním fungování rodiny, péči o dítě, předávání informací a spolupráci v situacích, které ovlivňují stabilitu a bezpečí dítěte.",
    ],
  },
];

export const DEFAULT_ABSENCES = {
  vacation: 0,
  sickLeave: 0,
  otherObstacles: 0,
  otherObstaclesUnit: "days",
  doctorVisitHours: 0,
  holiday: 0,
};
