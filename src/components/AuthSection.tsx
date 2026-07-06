import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { AuthMode, AuthProvider } from '../types';

type AuthSectionProps = {
  authProvider: AuthProvider;
  onAuthProviderChange: (value: AuthProvider) => void;
  authMode: AuthMode;
  onAuthModeChange: (value: AuthMode) => void;
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  phone: string;
  onPhoneChange: (value: string) => void;
  email: string;
  onEmailChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  detectedAddress: string;
  isResolvingAddress: boolean;
  isAuthSubmitting: boolean;
  onSubmitEmailAuth: () => void;
  onStartGoogleLogin: () => void;
  googleReady: boolean;
  googleEnabled: boolean;
  requiredGoogleEnvVar: string;
};

export function AuthSection({
  authProvider,
  onAuthProviderChange,
  authMode,
  onAuthModeChange,
  displayName,
  onDisplayNameChange,
  phone,
  onPhoneChange,
  email,
  onEmailChange,
  password,
  onPasswordChange,
  detectedAddress,
  isResolvingAddress,
  isAuthSubmitting,
  onSubmitEmailAuth,
  onStartGoogleLogin,
  googleReady,
  googleEnabled,
  requiredGoogleEnvVar,
}: AuthSectionProps) {
  const addressLabel = isResolvingAddress ? 'Se detecteaza adresa...' : detectedAddress || 'Nedisponibila';

  return (
    <View style={styles.authCard}>
      <Text style={styles.sectionTitle}>Autentificare</Text>

      <View style={styles.authProviderRow}>
        <Pressable
          onPress={() => onAuthProviderChange('email')}
          style={[styles.authProviderButton, authProvider === 'email' && styles.authProviderButtonActive]}
        >
          <Text style={[styles.authProviderText, authProvider === 'email' && styles.authProviderTextActive]}>
            Email
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onAuthProviderChange('google')}
          style={[styles.authProviderButton, authProvider === 'google' && styles.authProviderButtonActive]}
        >
          <Text style={[styles.authProviderText, authProvider === 'google' && styles.authProviderTextActive]}>
            Google
          </Text>
        </Pressable>
      </View>

      {authProvider === 'email' ? (
        <>
          <View style={styles.authModeRow}>
            <Pressable
              onPress={() => onAuthModeChange('login')}
              style={[styles.authModeButton, authMode === 'login' && styles.authModeButtonActive]}
            >
              <Text style={[styles.authModeText, authMode === 'login' && styles.authModeTextActive]}>
                Login
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onAuthModeChange('register')}
              style={[styles.authModeButton, authMode === 'register' && styles.authModeButtonActive]}
            >
              <Text style={[styles.authModeText, authMode === 'register' && styles.authModeTextActive]}>
                Register
              </Text>
            </Pressable>
          </View>

          {authMode === 'register' && (
            <>
              <TextInput
                value={displayName}
                onChangeText={onDisplayNameChange}
                placeholder="Nume"
                placeholderTextColor="#94a3b8"
                style={styles.input}
                autoCapitalize="words"
              />
              <TextInput
                value={phone}
                onChangeText={onPhoneChange}
                placeholder="Numar telefon"
                placeholderTextColor="#94a3b8"
                style={styles.input}
                keyboardType="phone-pad"
              />
              <AddressBox value={addressLabel} />
            </>
          )}

          <TextInput
            value={email}
            onChangeText={onEmailChange}
            placeholder="Email"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            value={password}
            onChangeText={onPasswordChange}
            placeholder="Parola"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            secureTextEntry
          />

          <Pressable onPress={onSubmitEmailAuth} style={styles.primaryButton} disabled={isAuthSubmitting}>
            <Text style={styles.primaryButtonText}>
              {isAuthSubmitting
                ? 'Se proceseaza...'
                : authMode === 'login'
                  ? 'Intra in cont'
                  : 'Creeaza cont'}
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          <TextInput
            value={phone}
            onChangeText={onPhoneChange}
            placeholder="Numar telefon (obligatoriu)"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            keyboardType="phone-pad"
          />
          <AddressBox value={addressLabel} />

          <Pressable
            onPress={onStartGoogleLogin}
            style={styles.googleButton}
            disabled={isAuthSubmitting || !googleReady || !googleEnabled}
          >
            <Text style={styles.googleButtonText}>
              {isAuthSubmitting ? 'Se proceseaza...' : 'Continua cu Google'}
            </Text>
          </Pressable>
          {!googleEnabled && (
            <Text style={styles.smallNote}>{`Pentru Google login seteaza ${requiredGoogleEnvVar}.`}</Text>
          )}
        </>
      )}
    </View>
  );
}

function AddressBox({ value }: { value: string }) {
  return (
    <View style={styles.addressBox}>
      <Text style={styles.addressTitle}>Adresa detectata prin geolocatie</Text>
      <Text style={styles.addressText}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  authCard: {
    backgroundColor: '#111827',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 10,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 4,
  },
  authProviderRow: {
    flexDirection: 'row',
    gap: 8,
  },
  authProviderButton: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  authProviderButtonActive: {
    backgroundColor: '#84cc16',
  },
  authProviderText: {
    color: '#cbd5e1',
    fontWeight: '700',
    fontSize: 13,
  },
  authProviderTextActive: {
    color: '#132b02',
  },
  authModeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  authModeButton: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  authModeButtonActive: {
    backgroundColor: '#84cc16',
  },
  authModeText: {
    color: '#cbd5e1',
    fontWeight: '700',
    fontSize: 13,
  },
  authModeTextActive: {
    color: '#132b02',
  },
  input: {
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f8fafc',
    backgroundColor: '#0b1220',
    fontSize: 14,
  },
  addressBox: {
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#0b1220',
    gap: 4,
  },
  addressTitle: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
  },
  addressText: {
    color: '#f1f5f9',
    fontSize: 12,
  },
  primaryButton: {
    marginTop: 8,
    backgroundColor: '#84cc16',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#132b02',
    fontWeight: '800',
    fontSize: 15,
  },
  googleButton: {
    marginTop: 4,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  googleButtonText: {
    color: '#0f172a',
    fontWeight: '800',
    fontSize: 14,
  },
  smallNote: {
    color: '#94a3b8',
    fontSize: 11,
  },
});
