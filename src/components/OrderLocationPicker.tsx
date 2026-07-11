import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Coordinate } from '../types';
import { translate, type Language } from '../i18n';

type Props = {
  language: Language;
  visible: boolean;
  value: Coordinate;
  onChange: (value: Coordinate) => void;
  onConfirm: () => void;
  onClose: () => void;
};

export function OrderLocationPicker({ language, visible, value, onChange, onConfirm, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.title}>{t('chooseOrderLocation')}</Text>
        <Text style={styles.hint}>{t('tapMapToMovePin')}</Text>
        <MapView
          style={styles.map}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          initialRegion={{ ...value, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
          onPress={(event) => onChange(event.nativeEvent.coordinate)}
        >
          <Marker coordinate={value} draggable onDragEnd={(event) => onChange(event.nativeEvent.coordinate)} />
        </MapView>
        <Text style={styles.coordinates}>{value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}</Text>
        <Pressable style={styles.confirmButton} onPress={onConfirm}>
          <Text style={styles.confirmText}>{t('confirmLocation')}</Text>
        </Pressable>
        <Pressable style={styles.cancelButton} onPress={onClose}>
          <Text style={styles.cancelText}>{t('cancel')}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0f172a', paddingHorizontal: 16, gap: 12 },
  title: { color: '#f8fafc', fontSize: 20, fontWeight: '800' },
  hint: { color: '#cbd5e1', fontSize: 13 },
  map: { flex: 1, minHeight: 360, borderRadius: 12 },
  coordinates: { color: '#cbd5e1', textAlign: 'center' },
  confirmButton: { backgroundColor: '#65a30d', borderRadius: 10, padding: 13, alignItems: 'center' },
  confirmText: { color: '#f7fee7', fontWeight: '800' },
  cancelButton: { borderWidth: 1, borderColor: '#64748b', borderRadius: 10, padding: 12, alignItems: 'center' },
  cancelText: { color: '#e2e8f0', fontWeight: '700' },
});
