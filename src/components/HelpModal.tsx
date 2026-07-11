import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Language } from '../i18n';

type Props = { language: Language; visible: boolean; onClose: () => void };

const CONTENT = {
  ro: {
    title: 'Cum folosești CartBuddy',
    intro: 'CartBuddy te ajută să găsești persoane din apropiere cu care să împarți o comandă și costurile asociate.',
    sections: [
      ['Cum plasezi o comandă', 'Alege platforma, perioada de așteptare, numărul dorit de participanți și raza de interes. Poți folosi locația curentă sau poți alege manual un pin pe hartă. Completează moneda, taxele și, dacă există, valoarea minimă a comenzii.'],
      ['Locația comenzii', 'Locația stabilește centrul cercului în care comanda poate fi descoperită. Organizatorul o poate modifica doar cât timp nu s-a alăturat niciun participant. După intrarea primului participant, locația se blochează.'],
      ['Cum te alături', 'Găsește o comandă din apropiere și rezervă un loc. Confirmă alăturarea înainte de expirarea rezervării. După confirmare devii participant și poți folosi produsele și chatul comenzii.'],
      ['Produse și comunicare', 'Fiecare membru poate adăuga linkurile produselor dorite. Organizatorul poate vedea și procesa produsele tuturor participanților. Folosește chatul pentru detalii despre comandă, plată și predare.'],
      ['Costul taxelor per participant', 'Aplicația adună taxa de livrare și taxa de procesare, apoi împarte suma la numărul actual de participanți. Formula este: (livrare + procesare) ÷ participanți. Valoarea se actualizează automat când se schimbă taxele sau numărul participanților.'],
      ['Important: taxele se pot modifica', 'Taxele afișate inițial sunt estimative. Taxa de livrare și taxa de procesare pot fi diferite în funcție de valoarea totală a coșului, promoții, praguri de livrare gratuită, greutate sau regulile platformei. Organizatorul le poate actualiza pe parcurs, iar costul per participant se recalculează automat. Confirmați întotdeauna costul final în chat înainte de plată.'],
      ['Statusul comenzii', 'Organizatorul actualizează comanda când este gata de plasare, plasată, livrată sau anulată. După plasare, lista produselor se blochează. După livrare, membrii se pot evalua reciproc.'],
      ['Ratinguri și recenzii', 'După livrare poți acorda o notă și o recenzie celorlalți membri. Evaluările sunt vizibile în profil și ajută comunitatea să identifice organizatori și participanți de încredere.'],
      ['Siguranță', 'Nu publica în chat date bancare, parole sau informații sensibile. Verifică produsele, taxele și suma finală înainte de a trimite bani. Pentru întâlniri, alege locuri publice și sigure.'],
    ],
    close: 'Închide',
  },
  en: {
    title: 'How to use CartBuddy',
    intro: 'CartBuddy helps you find nearby people with whom you can share an order and its associated costs.',
    sections: [
      ['How to create an order', 'Choose the platform, waiting period, desired number of participants, and search radius. Use your current location or place a pin manually on the map. Enter the currency, fees, and optional minimum order value.'],
      ['Order location', 'The location is the center of the area where the order can be discovered. The organizer can edit it only before another participant joins. It is locked after the first participant joins.'],
      ['How to join', 'Find a nearby order and reserve a spot. Confirm before the reservation expires. Once confirmed, you become a participant and can use the order products and chat sections.'],
      ['Products and communication', 'Each member can add links to desired products. The organizer can view and process every participant’s products. Use chat to agree on order, payment, and handover details.'],
      ['Fees per participant', 'The app adds the delivery and processing fees, then divides the result by the current number of participants: (delivery + processing) ÷ participants. It updates automatically when fees or participant count changes.'],
      ['Important: fees can change', 'Initially displayed fees are estimates. Delivery and processing fees may change based on cart total, promotions, free-delivery thresholds, weight, or platform rules. The organizer can update them during the order and the per-participant amount is recalculated automatically. Always confirm the final amount in chat before payment.'],
      ['Order status', 'The organizer marks the order as ready, ordered, delivered, or cancelled. Product lists are locked after ordering. Members can rate each other after delivery.'],
      ['Ratings and reviews', 'After delivery, you can rate and review the other members. Reviews appear on profiles and help the community identify reliable organizers and participants.'],
      ['Safety', 'Do not post bank details, passwords, or sensitive information in chat. Verify products, fees, and the final amount before sending money. Choose safe public places for handovers.'],
    ],
    close: 'Close',
  },
} as const;

export function HelpModal({ language, visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const content = CONTENT[language];
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.title}>{content.title}</Text>
        <Text style={styles.intro}>{content.intro}</Text>
        {content.sections.map(([title, body]) => (
          <View key={title} style={title.startsWith('Important') || title.startsWith('Important:') ? styles.warning : styles.section}>
            <Text style={styles.sectionTitle}>{title}</Text>
            <Text style={styles.body}>{body}</Text>
          </View>
        ))}
        <Pressable onPress={onClose} style={styles.closeButton}><Text style={styles.closeText}>{content.close}</Text></Pressable>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, backgroundColor: '#0f172a', paddingHorizontal: 18, gap: 12 },
  title: { color: '#f8fafc', fontSize: 24, fontWeight: '900' },
  intro: { color: '#cbd5e1', fontSize: 15, lineHeight: 22 },
  section: { backgroundColor: '#0b1220', borderWidth: 1, borderColor: '#334155', borderRadius: 12, padding: 14, gap: 6 },
  warning: { backgroundColor: '#3f1d16', borderWidth: 1, borderColor: '#f97316', borderRadius: 12, padding: 14, gap: 6 },
  sectionTitle: { color: '#f8fafc', fontSize: 16, fontWeight: '800' },
  body: { color: '#dbeafe', fontSize: 14, lineHeight: 21 },
  closeButton: { backgroundColor: '#65a30d', borderRadius: 10, padding: 13, alignItems: 'center', marginTop: 4 },
  closeText: { color: '#f7fee7', fontWeight: '900' },
});
