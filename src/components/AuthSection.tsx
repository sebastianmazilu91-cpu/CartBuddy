import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { translate, type Language, type TranslationKey } from '../i18n';
import type { AuthMode } from '../types';

type AuthSectionProps = {
  language: Language;
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
};

export function AuthSection({
  language,
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
}: AuthSectionProps) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const t = (key: TranslationKey) => translate(language, key);
  const addressLabel = isResolvingAddress ? t('detectingAddress') : detectedAddress || t('unavailable');

  return (
    <View style={styles.authCard}>
      <View style={styles.authModeRow}>
        <Pressable
          onPress={() => onAuthModeChange('login')}
          style={[styles.authModeButton, authMode === 'login' && styles.authModeButtonActive]}
        >
          <Text style={[styles.authModeText, authMode === 'login' && styles.authModeTextActive]}>
            {t('auth')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onAuthModeChange('register')}
          style={[styles.authModeButton, authMode === 'register' && styles.authModeButtonActive]}
        >
          <Text style={[styles.authModeText, authMode === 'register' && styles.authModeTextActive]}>
            {t('createAccount')}
          </Text>
        </Pressable>
      </View>

      {googleEnabled && (
        <>
          <Pressable
            onPress={onStartGoogleLogin}
            style={[styles.googleButton, (!googleReady || isAuthSubmitting) && styles.disabledButton]}
            disabled={isAuthSubmitting || !googleReady}
          >
            {isAuthSubmitting ? (
              <Text style={styles.googleButtonText}>{t('processing')}</Text>
            ) : (
              <View style={styles.googleButtonContent}>
                <Image
                  source={{ uri: 'https://developers.google.com/identity/images/g-logo.png' }}
                  style={styles.googleLogo}
                />
                <Text style={styles.googleButtonText}>{t('continueWithGoogle')}</Text>
              </View>
            )}
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('or')}</Text>
            <View style={styles.dividerLine} />
          </View>
        </>
      )}

      {authMode === 'register' && (
        <>
          <Text style={styles.fieldLabel}>{t('name')}</Text>
          <TextInput
            value={displayName}
            onChangeText={onDisplayNameChange}
            placeholder={t('name')}
            placeholderTextColor="#94a3b8"
            style={styles.input}
            autoCapitalize="words"
          />
          <Text style={styles.fieldLabel}>{t('phoneNumber')}</Text>
          <TextInput
            value={phone}
            onChangeText={onPhoneChange}
            placeholder={t('phoneNumber')}
            placeholderTextColor="#94a3b8"
            style={styles.input}
            keyboardType="phone-pad"
          />
          <AddressBox value={addressLabel} language={language} />
        </>
      )}

      <Text style={styles.fieldLabel}>{t('email')}</Text>
      <TextInput
        value={email}
        onChangeText={onEmailChange}
        placeholder="email@example.com"
        placeholderTextColor="#94a3b8"
        style={styles.input}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <Text style={styles.fieldLabel}>{t('password')}</Text>
      <View style={styles.passwordInputWrap}>
        <TextInput
          value={password}
          onChangeText={onPasswordChange}
          placeholder={t('password')}
          placeholderTextColor="#94a3b8"
          style={styles.passwordInput}
          secureTextEntry={!isPasswordVisible}
        />
        <Pressable
          onPress={() => setIsPasswordVisible((value) => !value)}
          style={styles.passwordToggle}
        >
          <Text style={styles.passwordToggleText}>{isPasswordVisible ? '\u{1F648}' : '\u{1F441}'}</Text>
        </Pressable>
      </View>

      {authMode === 'login' && (
        <Pressable style={styles.forgotPasswordButton}>
          <Text style={styles.forgotPasswordText}>{t('forgotPassword')}</Text>
        </Pressable>
      )}

      <Pressable
        onPress={onSubmitEmailAuth}
        style={[styles.primaryButton, isAuthSubmitting && styles.disabledButton]}
        disabled={isAuthSubmitting}
      >
        <Text style={styles.primaryButtonText}>
          {isAuthSubmitting
            ? t('processing')
            : authMode === 'login'
              ? t('loginEmail')
              : t('createAccount')}
        </Text>
      </Pressable>
    </View>
  );
}

function AddressBox({ value, language }: { value: string; language: Language }) {
  return (
    <View style={styles.addressBox}>
      <Text style={styles.addressTitle}>{translate(language, 'detectedAddress')}</Text>
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
    gap: 12,
  },
  authModeRow: {
    flexDirection: 'row',
    gap: 18,
    marginBottom: 4,
  },
  authModeButton: {
    flex: 1,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    paddingVertical: 10,
    alignItems: 'center',
  },
  authModeButtonActive: {
    borderBottomColor: '#86efac',
  },
  authModeText: {
    color: '#cbd5e1',
    fontWeight: '800',
    fontSize: 14,
  },
  authModeTextActive: {
    color: '#f8fafc',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 2,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#334155',
  },
  dividerText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '700',
  },
  fieldLabel: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
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
  passwordInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#475569',
    borderRadius: 10,
    backgroundColor: '#0b1220',
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f8fafc',
    fontSize: 14,
  },
  passwordToggle: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  passwordToggleText: {
    color: '#e2e8f0',
    fontSize: 17,
  },
  forgotPasswordButton: {
    alignSelf: 'flex-end',
    paddingVertical: 2,
  },
  forgotPasswordText: {
    color: '#bfdbfe',
    fontSize: 12,
    fontWeight: '700',
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
    backgroundColor: '#65a30d',
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
  googleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleLogo: {
    width: 18,
    height: 18,
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
  disabledButton: {
    opacity: 0.55,
  },
});
