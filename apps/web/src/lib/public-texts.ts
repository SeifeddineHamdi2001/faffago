import {
  PUBLIC_STATUS_LABELS_FR,
  PUBLIC_TIMELINE_STEP_LABELS_FR,
  type PublicStatus,
  type PublicTimelineStep,
} from '@faffago/shared';
import type { Locale } from './locale';

/**
 * Every text of the public site (Landing 2–4), in French and Arabic. The
 * French follows docs/landing.md word for word where it gives the words; the
 * rest, and every Arabic text, is listed in docs/ui-texts.md for the review
 * before launch. The Arabic is written for Tunisian readers and must be read
 * by a native speaker before launch (Landing 5).
 *
 * Amounts, percentages and counts come in already formatted: they are read
 * from Paramètres (Landing 3), never typed here.
 */

export interface PublicTexts {
  meta: { title: string; description: string; trackingTitle: string };
  nav: {
    track: string;
    prices: string;
    zones: string;
    faq: string;
    login: string;
    partner: string;
    menu: string;
    /** The other language's name, written in that language. */
    otherLanguage: string;
  };
  hero: { title: string; lead: string; visual: string };
  trackBox: { title: string; label: string; submit: string; hint: string };
  how: { title: string; steps: Array<{ title: string; text: string }> };
  why: { title: string; items: Array<{ title: string; text: string }> };
  prices: {
    title: string;
    lead: string;
    service: string;
    price: string;
    delivery: string;
    return: string;
    relaunch: string;
    free: string;
    changeClient: string;
    pickup: string;
    pickupPrice: (threshold: number, fee: string) => string;
    retenueNote: (rate: string) => string;
    faqLink: string;
    unavailable: string;
  };
  zones: { title: string; lead: string; unavailable: string };
  faq: {
    title: string;
    items: (v: {
      retenueRate: string;
      verifyHours: number;
      maxAttempts: number;
    }) => Array<{ q: string; a: string; link?: { href: string; label: string } }>;
  };
  contact: {
    title: string;
    lead: string;
    whatsapp: string;
    phone: string;
    facebook: string;
    instagram: string;
    tiktok: string;
  };
  footer: { tagline: string; contact: string; follow: string };
  tracking: {
    title: string;
    status: string;
    lastUpdate: string;
    shop: string;
    delegation: string;
    amount: string;
    nothingToPay: string;
    livreur: string;
    postponedTo: string;
    history: string;
    notFound: string;
    tooMany: string;
    unavailable: string;
    another: string;
    statuses: Record<PublicStatus, string>;
    steps: Record<PublicTimelineStep, string>;
  };
}

const FR: PublicTexts = {
  meta: {
    title: 'Faffa Go — Livraison contre remboursement dans le Grand Tunis',
    description:
      'Livraison express contre remboursement pour les vendeurs en ligne du Grand Tunis. Un échec de livraison n’est pas un retour : c’est vous qui décidez. Votre cash apporté avec un bon signé.',
    trackingTitle: 'Suivi du colis — Faffa Go',
  },
  nav: {
    track: 'Suivre un colis',
    prices: 'Tarifs',
    zones: 'Zones couvertes',
    faq: 'FAQ',
    login: 'Se connecter',
    partner: 'Devenir partenaire',
    menu: 'Menu',
    otherLanguage: 'العربية',
  },
  hero: {
    title: 'Un échec de livraison n’est pas un retour. Chez Faffa Go, c’est vous qui décidez.',
    lead: 'Livraison express contre remboursement dans le Grand Tunis. Chaque échec est vérifié avec vous avant tout retour, et votre cash vous est apporté avec un bon signé qui liste chaque colis.',
    visual: 'Un livreur Faffa Go à moto',
  },
  trackBox: {
    title: 'Suivre mon colis',
    label: 'Code du colis',
    submit: 'Suivre',
    hint: 'Le code est imprimé sur l’étiquette du colis.',
  },
  how: {
    title: 'Comment ça marche',
    steps: [
      {
        title: 'Vous créez vos colis',
        text: 'Dans votre espace vendeur, un par un ou par import CSV, puis vous imprimez les étiquettes.',
      },
      { title: 'On ramasse', text: 'Un ramasseur Faffa Go passe chez vous prendre vos colis.' },
      {
        title: 'On livre',
        text: 'Le livreur de la zone livre votre client et encaisse le montant.',
      },
      {
        title: 'Votre cash + bon signé',
        text: 'Le ramasseur vous apporte votre argent avec un bon de versement qui liste chaque colis.',
      },
    ],
  },
  why: {
    title: 'Pourquoi Faffa Go',
    items: [
      {
        title: 'Un échec n’est pas un retour',
        text: 'Une livraison échouée est d’abord vérifiée. Vous choisissez : relancer (gratuit), changer de client, ou retourner. Moins de retours, plus de ventes.',
      },
      {
        title: 'Cash apporté chez vous',
        text: 'Le ramasseur vous apporte votre argent avec un bon de versement qui liste chaque colis. Vous comptez, vous signez.',
      },
      {
        title: 'Un tarif pour tous',
        text: 'Les mêmes prix publics pour tous les vendeurs, petits ou grands.',
      },
      {
        title: 'Tout est traçable',
        text: 'Votre espace vendeur montre chaque colis, chaque scan, chaque dinar.',
      },
      {
        title: 'Livreurs de votre zone',
        text: 'Chaque zone a son propre livreur, qui connaît ses rues.',
      },
    ],
  },
  prices: {
    title: 'Tarifs',
    lead: 'Les mêmes prix pour tous les vendeurs.',
    service: 'Service',
    price: 'Prix',
    delivery: 'Livraison (Grand Tunis)',
    return: 'Retour',
    relaunch: 'Relance',
    free: 'Gratuite',
    changeClient: 'Changer de client',
    pickup: 'Ramassage chez vous',
    pickupPrice: (threshold, fee) =>
      `Gratuit dès ${threshold} colis · ${fee} en dessous de ${threshold} colis`,
    retenueNote: (rate) =>
      `Vendeurs sans patente ni carte auto-entrepreneur : retenue à la source de ${rate} % sur les paiements.`,
    faqLink: 'Voir la FAQ',
    unavailable: 'Les tarifs sont momentanément indisponibles. Contactez-nous.',
  },
  zones: {
    title: 'Zones couvertes',
    lead: 'Nous livrons dans ces délégations du Grand Tunis.',
    unavailable: 'La liste des zones est momentanément indisponible. Contactez-nous.',
  },
  faq: {
    title: 'Questions fréquentes',
    items: ({ retenueRate, verifyHours, maxAttempts }) => [
      {
        q: 'Quand et comment suis-je payé ?',
        a: 'En espèces uniquement. Le ramasseur vous apporte votre argent avec un bon de versement qui liste chaque colis payé. Un colis est payé une fois son montant arrivé au dépôt Faffa Go.',
      },
      {
        q: 'Que se passe-t-il si le client ne répond pas ?',
        a: `Le colis passe « À vérifier » et vous choisissez dans votre espace : relancer (gratuit), changer de client, ou retourner. Sans décision sous ${verifyHours} heures, le colis vous est retourné. Au maximum ${maxAttempts} tentatives par client. Si c’est le client lui-même qui demande un autre jour, la livraison est reportée à la date qu’il choisit.`,
      },
      {
        q: 'Quels documents faut-il ?',
        a: `Votre CIN, toujours. Avec une patente ou une carte d’auto-entrepreneur, rien n’est retenu. Sans l’une ni l’autre, une retenue à la source de ${retenueRate} % s’applique sur vos paiements.`,
      },
      {
        q: 'Comment commencer ?',
        a: 'Contactez-nous par WhatsApp ou par téléphone. Nous créons votre compte et planifions votre premier ramassage.',
      },
      {
        q: 'Où livrez-vous ?',
        a: 'Dans le Grand Tunis.',
        link: { href: '#zones', label: 'Voir les zones couvertes' },
      },
    ],
  },
  contact: {
    title: 'Devenir partenaire',
    lead: 'Pas de formulaire : parlez-nous directement. Nous créons votre compte et planifions votre premier ramassage.',
    whatsapp: 'WhatsApp',
    phone: 'Appeler',
    facebook: 'Facebook',
    instagram: 'Instagram',
    tiktok: 'TikTok',
  },
  footer: {
    tagline: 'Livraison express contre remboursement dans le Grand Tunis.',
    contact: 'Contact',
    follow: 'Suivez-nous',
  },
  tracking: {
    title: 'Suivi du colis',
    status: 'Statut',
    lastUpdate: 'Dernière mise à jour',
    shop: 'Boutique',
    delegation: 'Délégation',
    amount: 'Montant à préparer en espèces',
    nothingToPay: 'Rien à payer à la livraison',
    livreur: 'Votre livreur',
    postponedTo: 'Livraison prévue le',
    history: 'Historique',
    // Landing 4.4, word for word.
    notFound: 'Aucun colis trouvé avec ce code. Vérifiez le code sur l’étiquette.',
    tooMany: 'Trop de tentatives. Réessayez dans quelques instants.',
    unavailable: 'Le suivi est momentanément indisponible. Réessayez dans quelques instants.',
    another: 'Suivre un autre colis',
    statuses: PUBLIC_STATUS_LABELS_FR,
    steps: PUBLIC_TIMELINE_STEP_LABELS_FR,
  },
};

const AR: PublicTexts = {
  meta: {
    title: 'Faffa Go — توصيل مع الدفع عند الاستلام في تونس الكبرى',
    description:
      'توصيل سريع مع الدفع عند الاستلام للبائعين عبر الإنترنت في تونس الكبرى. فشل التوصيل ليس إرجاعاً: القرار لك. أموالك تصلك نقداً مع وصل ممضى.',
    trackingTitle: 'تتبّع الطرد — Faffa Go',
  },
  nav: {
    track: 'تتبّع طرد',
    prices: 'الأسعار',
    zones: 'مناطق التغطية',
    faq: 'أسئلة شائعة',
    // Approved 2026-09-25.
    login: 'تسجيل الدخول',
    partner: 'كن شريكاً',
    menu: 'القائمة',
    otherLanguage: 'Français',
  },
  hero: {
    title: 'فشل التوصيل ليس إرجاعاً. مع Faffa Go، القرار لك.',
    lead: 'توصيل سريع مع الدفع عند الاستلام في تونس الكبرى. نتحقق معك من كل محاولة فاشلة قبل أي إرجاع، وتصلك أموالك نقداً مع وصل ممضى يذكر كل طرد.',
    visual: 'عامل توصيل Faffa Go على دراجة نارية',
  },
  trackBox: {
    title: 'تتبّع طردي',
    label: 'رمز الطرد',
    submit: 'تتبّع',
    hint: 'الرمز مطبوع على ملصق الطرد.',
  },
  how: {
    title: 'كيف نعمل',
    steps: [
      {
        title: 'تُنشئ طرودك',
        text: 'من فضاء البائع، طرداً بطرد أو باستيراد ملف CSV، ثم تطبع الملصقات.',
      },
      { title: 'نستلمها منك', text: 'يمرّ عندك مستلم من Faffa Go لأخذ طرودك.' },
      { title: 'نوصلها', text: 'عامل توصيل المنطقة يوصل الطرد إلى حريفك ويقبض المبلغ.' },
      {
        title: 'أموالك + وصل ممضى',
        text: 'يُحضر لك المستلم أموالك مع وصل دفع يذكر كل طرد.',
      },
    ],
  },
  why: {
    title: 'لماذا Faffa Go',
    items: [
      {
        title: 'الفشل ليس إرجاعاً',
        text: 'نتحقق أولاً من كل توصيل فاشل. أنت تختار: إعادة المحاولة (مجاناً)، أو تغيير الحريف، أو الإرجاع. إرجاعات أقل ومبيعات أكثر.',
      },
      {
        title: 'أموالك تصلك إلى محلّك',
        text: 'يُحضر لك المستلم أموالك مع وصل دفع يذكر كل طرد. تعدّ، ثم تُمضي.',
      },
      {
        title: 'سعر واحد للجميع',
        text: 'نفس الأسعار المعلنة لكل البائعين، صغاراً كانوا أو كباراً.',
      },
      {
        title: 'كل شيء قابل للتتبّع',
        text: 'فضاء البائع يعرض كل طرد، وكل عملية مسح، وكل دينار.',
      },
      {
        title: 'عمّال توصيل من منطقتك',
        text: 'لكل منطقة عامل توصيل خاص بها يعرف شوارعها.',
      },
    ],
  },
  prices: {
    title: 'الأسعار',
    lead: 'نفس الأسعار لكل البائعين.',
    service: 'الخدمة',
    price: 'السعر',
    delivery: 'التوصيل (تونس الكبرى)',
    return: 'الإرجاع',
    relaunch: 'إعادة المحاولة',
    free: 'مجاناً',
    changeClient: 'تغيير الحريف',
    pickup: 'الاستلام من عندك',
    pickupPrice: (threshold, fee) =>
      `مجاناً ابتداءً من ${threshold} طرود · ${fee} لأقل من ${threshold} طرود`,
    retenueNote: (rate) =>
      `البائعون الذين ليست لهم باتيندة ولا بطاقة مبادر ذاتي: خصم من المورد بنسبة ${rate} % على الدفعات.`,
    faqLink: 'انظر الأسئلة الشائعة',
    unavailable: 'الأسعار غير متاحة حالياً. اتصل بنا.',
  },
  zones: {
    title: 'مناطق التغطية',
    lead: 'نوصل إلى هذه المعتمديات في تونس الكبرى.',
    unavailable: 'قائمة المناطق غير متاحة حالياً. اتصل بنا.',
  },
  faq: {
    title: 'أسئلة شائعة',
    items: ({ retenueRate, verifyHours, maxAttempts }) => [
      {
        q: 'متى وكيف أتحصّل على أموالي؟',
        a: 'نقداً فقط. يُحضر لك المستلم أموالك مع وصل دفع يذكر كل طرد مدفوع. يُعتبر الطرد مدفوعاً عندما يصل مبلغه إلى مستودع Faffa Go.',
      },
      {
        q: 'ماذا يحدث إذا لم يُجب الحريف؟',
        a: `يصبح الطرد «للتحقق» وتختار من فضائك: إعادة المحاولة (مجاناً)، أو تغيير الحريف، أو الإرجاع. إذا لم تقرّر خلال ${verifyHours} ساعة، يُرجع إليك الطرد. ${maxAttempts} محاولات على الأكثر لكل حريف. وإذا طلب الحريف نفسه يوماً آخر، يؤجَّل التوصيل إلى التاريخ الذي اختاره.`,
      },
      {
        q: 'ما هي الوثائق المطلوبة؟',
        a: `بطاقة التعريف الوطنية دائماً. مع الباتيندة أو بطاقة المبادر الذاتي، لا يُخصم شيء. بدونهما، يُطبَّق خصم من المورد بنسبة ${retenueRate} % على دفعاتك.`,
      },
      {
        q: 'كيف أبدأ؟',
        a: 'اتصل بنا عبر واتساب أو بالهاتف. ننشئ حسابك ونبرمج أول عملية استلام.',
      },
      {
        q: 'أين توصلون؟',
        a: 'في تونس الكبرى.',
        link: { href: '#zones', label: 'انظر مناطق التغطية' },
      },
    ],
  },
  contact: {
    title: 'كن شريكاً',
    lead: 'لا توجد استمارة: تحدّث معنا مباشرة. ننشئ حسابك ونبرمج أول عملية استلام.',
    whatsapp: 'واتساب',
    phone: 'اتصل بنا',
    facebook: 'فيسبوك',
    instagram: 'إنستغرام',
    tiktok: 'تيك توك',
  },
  footer: {
    tagline: 'توصيل سريع مع الدفع عند الاستلام في تونس الكبرى.',
    contact: 'اتصل بنا',
    follow: 'تابعنا',
  },
  tracking: {
    title: 'تتبّع الطرد',
    status: 'الحالة',
    lastUpdate: 'آخر تحديث',
    shop: 'المتجر',
    delegation: 'المعتمدية',
    amount: 'المبلغ الواجب تحضيره نقداً',
    nothingToPay: 'لا شيء للدفع عند الاستلام',
    livreur: 'عامل التوصيل',
    postponedTo: 'التوصيل مبرمج يوم',
    history: 'السجلّ',
    notFound: 'لم يتم العثور على أي طرد بهذا الرمز. تحقّق من الرمز على الملصق.',
    tooMany: 'محاولات كثيرة. أعد المحاولة بعد لحظات.',
    unavailable: 'التتبّع غير متاح حالياً. أعد المحاولة بعد لحظات.',
    another: 'تتبّع طرد آخر',
    statuses: {
      COMMANDE_ENREGISTREE: 'تم تسجيل الطلب',
      CHEZ_FAFFA_GO: 'لدى Faffa Go',
      EN_COURS_DE_LIVRAISON: 'قيد التوصيل',
      LIVRE: 'تم التوصيل',
      LIVRAISON_REPORTEE: 'تم تأجيل التوصيل — سيتصل بك البائع',
      LIVRAISON_REPORTEE_CLIENT: 'تم تأجيل التوصيل',
      RETOURNE_AU_VENDEUR: 'أُرجع إلى البائع',
      COMMANDE_ANNULEE: 'تم إلغاء الطلب',
    },
    steps: {
      COMMANDE_ENREGISTREE: 'تم تسجيل الطلب',
      CHEZ_FAFFA_GO: 'لدى Faffa Go',
      EN_COURS_DE_LIVRAISON: 'قيد التوصيل',
      CHANGEMENT_DE_CLIENT: 'تغيير الحريف',
      LIVRE: 'تم التوصيل',
      RETOURNE_AU_VENDEUR: 'أُرجع إلى البائع',
      COMMANDE_ANNULEE: 'تم إلغاء الطلب',
    },
  },
};

export function publicTexts(locale: Locale): PublicTexts {
  return locale === 'ar' ? AR : FR;
}
