import { Ionicons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { startOAuthLogin } from "@/constants/oauth";

export default function LoginScreen() {
  const { user, loading } = useAuth();
  const [loginError, setLoginError] = useState("");
  const [startingLogin, setStartingLogin] = useState(false);

  if (loading) {
    return (
      <ScreenContainer containerClassName="bg-[#F4F8F8]" safeAreaClassName="bg-[#F4F8F8]">
        <View style={styles.loadingState}>
          <ActivityIndicator color="#0C5666" size="large" />
          <Text style={styles.loadingText}>Verificando acesso...</Text>
        </View>
      </ScreenContainer>
    );
  }

  if (user) return <Redirect href="/(tabs)" />;

  const handleLogin = async () => {
    setStartingLogin(true);
    setLoginError("");
    try {
      await startOAuthLogin();
    } catch (error) {
      setStartingLogin(false);
      setLoginError(error instanceof Error ? error.message : "Não foi possível iniciar o login.");
    }
  };

  return (
    <ScreenContainer containerClassName="bg-[#F4F8F8]" safeAreaClassName="bg-[#F4F8F8]">
      <View style={styles.page}>
        <View style={styles.brandBlock}>
          <View style={styles.logoFrame}>
            <Image resizeMode="contain" source={require("@/assets/images/icon.png")} style={styles.logo} />
          </View>
          <Text style={styles.eyebrow}>ACESSO DE OPERADORES</Text>
          <Text style={styles.title}>CREC Almoxarifado</Text>
          <Text style={styles.subtitle}>
            Entre com sua conta autorizada para registrar saídas e atualizar o estoque.
          </Text>
        </View>

        <View style={styles.loginCard}>
          <View style={styles.cardIcon}>
            <Ionicons name="shield-checkmark-outline" size={25} color="#0C5666" />
          </View>
          <Text style={styles.cardTitle}>Login obrigatório</Text>
          <Text style={styles.cardText}>
            Cada saída ficará vinculada ao operador que realizou o registro.
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={startingLogin}
            onPress={() => void handleLogin()}
            style={({ pressed }) => [styles.loginButton, (pressed || startingLogin) && styles.pressed]}
          >
            {startingLogin ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="log-in-outline" size={19} color="#FFFFFF" />}
            <Text style={styles.loginButtonText}>{startingLogin ? "Abrindo login..." : "Entrar com conta autorizada"}</Text>
          </Pressable>
          {loginError ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle-outline" size={17} color="#A63D40" />
              <Text style={styles.errorText}>{loginError}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.footer}>
          <View style={styles.onlineDot} />
          <Text style={styles.footerText}>Acesso protegido e sincronização segura</Text>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: "#587278", fontSize: 13 },
  page: { flex: 1, justifyContent: "center", paddingHorizontal: 24, maxWidth: 520, width: "100%", alignSelf: "center" },
  brandBlock: { alignItems: "center", marginBottom: 28 },
  logoFrame: { width: 98, height: 98, borderRadius: 28, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DCE8E9", alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: 20 },
  logo: { width: 98, height: 98 },
  eyebrow: { color: "#6F858A", fontSize: 10, fontWeight: "900", letterSpacing: 1.35, marginBottom: 5 },
  title: { color: "#17363D", fontSize: 29, fontWeight: "900", letterSpacing: -0.7 },
  subtitle: { color: "#71878C", fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 330, marginTop: 10 },
  loginCard: { backgroundColor: "#FFFFFF", borderRadius: 23, padding: 20, borderWidth: 1, borderColor: "#E4EEEE", shadowColor: "#0C5666", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 14, elevation: 2 },
  cardIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#DDF1EC", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  cardTitle: { color: "#17363D", fontSize: 18, fontWeight: "900" },
  cardText: { color: "#71878C", fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 17 },
  loginButton: { minHeight: 52, borderRadius: 15, backgroundColor: "#0C5666", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 16 },
  loginButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 7, padding: 10, borderRadius: 12, backgroundColor: "#FCEBEC", marginTop: 13 },
  errorText: { color: "#8B3D40", fontSize: 12, lineHeight: 17, flex: 1 },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 22 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#21A375" },
  footerText: { color: "#91A2A6", fontSize: 11 },
  pressed: { opacity: 0.68 },
});
