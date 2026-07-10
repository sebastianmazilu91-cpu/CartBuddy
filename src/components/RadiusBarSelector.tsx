import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RADIUS_OPTIONS } from '../constants';
import { formatDistance, labelRadius } from '../formatters';
import { translate, type Language } from '../i18n';

type RadiusBarSelectorProps = {
  language: Language;
  value: number;
  onChange: (value: number) => void;
};

export function RadiusBarSelector({ language, value, onChange }: RadiusBarSelectorProps) {
  const selectedIndex = Math.max(RADIUS_OPTIONS.indexOf(value), 0);
  const progressPercent =
    RADIUS_OPTIONS.length <= 1 ? 100 : (selectedIndex / (RADIUS_OPTIONS.length - 1)) * 100;

  return (
    <View style={styles.radiusBarWrapper}>
      <View style={styles.radiusTrackArea}>
        <View style={styles.radiusTrackRail}>
          <View style={styles.radiusTrackBase} />
          <View style={[styles.radiusTrackFill, { width: `${progressPercent}%` }]} />
        </View>
        <View style={styles.radiusStepsRow}>
          {RADIUS_OPTIONS.map((radius, index) => {
            const isSelected = index === selectedIndex;
            const isReached = index <= selectedIndex;

            return (
              <Pressable key={radius} onPress={() => onChange(radius)} style={styles.radiusStep} hitSlop={8}>
                <View
                  style={[
                    styles.radiusDot,
                    isReached && styles.radiusDotReached,
                    isSelected && styles.radiusDotSelected,
                  ]}
                />
                <Text style={[styles.radiusLabel, isSelected && styles.radiusLabelSelected]}>
                  {labelRadius(radius)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Text style={styles.radiusValueText}>
        {translate(language, 'selected')}: {formatDistance(value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  radiusBarWrapper: {
    marginBottom: 10,
    gap: 8,
  },
  radiusTrackArea: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 14,
    backgroundColor: '#0b1220',
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 8,
    overflow: 'hidden',
  },
  radiusTrackRail: {
    marginHorizontal: 8,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#233245',
    overflow: 'hidden',
  },
  radiusTrackBase: {
    ...StyleSheet.absoluteFillObject,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#233245',
  },
  radiusTrackFill: {
    height: 4,
    borderRadius: 999,
    backgroundColor: '#84cc16',
  },
  radiusStepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -7,
  },
  radiusStep: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  radiusDot: {
    width: 11,
    height: 11,
    borderRadius: 999,
    marginTop: 3,
    backgroundColor: '#334155',
    borderWidth: 1,
    borderColor: '#475569',
  },
  radiusDotReached: {
    backgroundColor: '#a3e635',
    borderColor: '#a3e635',
  },
  radiusDotSelected: {
    width: 14,
    height: 14,
    backgroundColor: '#d9f99d',
    borderColor: '#ecfccb',
  },
  radiusLabel: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
  },
  radiusLabelSelected: {
    color: '#ecfccb',
  },
  radiusValueText: {
    color: '#d9f99d',
    fontSize: 12,
    fontWeight: '700',
  },
});
