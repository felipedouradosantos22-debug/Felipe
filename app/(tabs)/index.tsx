import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { SignaturePad, type SignatureStroke } from "@/components/signature-pad";
import { SiteConnectionPanel } from "@/components/site-connection-panel";
import { useAuth } from "@/hooks/use-auth";

type EquipmentOption = {
  code: string;
  name: string;
  category: string;
};

const EQUIPMENT_OPTIONS: EquipmentOption[] = [
  { code: "EQP-001", name: "Furadeira de impacto", category: "Ferramentas" },
  { code: "EQP-014", name: "Notebook Lenovo 14\"", category: "Informática" },
  { code: "EQP-022", name: "Leitor de código de barras", category: "Operação" },
];

function resolveEquipment(rawValue: string) {
  const normalized = rawValue.trim().toUpperCase();
  const option = EQUIPMENT_OPTIONS.find((item) => item.code === normalized);
  return option ? { code: option.code, name: option.name } : { code: normalized, name: "" };
}

function FieldLabel({ children, required = false }: { children: string; required?: boolean }) {
  return (
    <Text style={styles.fieldLabel}>
      {children} {required ? <Text style={styles.required}>*</Text> : null}
    </Text>
  );
}

function StepMarker({ number, label }: { number: string; label: string }) {
  return (
    <View style={styles.stepMarker}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{number}</Text>
      </View>
      <Text style={styles.stepLabel}>{label}</Text>
    </View>
  );
}

function PrimaryButton({
  label,
  icon,
  onPress,
  disabled = false,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.primaryButton, (pressed || disabled) && styles.primaryButtonMuted]}
    >
      <Ionicons name={icon} size={18} color="#FFFFFF" />
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const { user, logout } = useAuth();
  const [equipmentCode, setEquipmentCode] = useState("");
  const [equipmentName, setEquipmentName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [requesterName, setRequesterName] = useState("");
  const [requesterRegistration, setRequesterRegistration] = useState("");
  const [requesterDepartment, setRequesterDepartment] = useState("");
  const [signature, setSignature] = useState<SignatureStroke[]>([]);
  const [showScanner, setShowScanner] = useState(false);
  const [showEquipmentPicker, setShowEquipmentPicker] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [permission, requestPermission] = useCameraPermissions();

  useEffect(() => {
    if (showScanner && Platform.OS !== "web" && !permission?.granted) {
      void requestPermission();
    }
  }, [permission?.granted, requestPermission, showScanner]);

  const quantityValue = Number(quantity);
  const stepperQuantity = Number.isInteger(quantityValue) && quantityValue > 0 ? quantityValue : 1;

  const handleBarcodeScanned = useCallback((result: BarcodeScanningResult) => {
    const resolved = resolveEquipment(result.data);
    setEquipmentCode(resolved.code);
    if (resolved.name) setEquipmentName(resolved.name);
    setShowScanner(false);
  }, []);

  const chooseEquipment = (option: EquipmentOption) => {
    setEquipmentCode(option.code);
    setEquipmentName(option.name);
    setShowEquipmentPicker(false);
  };

  const validateAndReview = () => {
    if (!equipmentCode.trim() || !equipmentName.trim()) {
      setErrorMessage("Informe o código e o nome do equipamento.");
      return;
    }
    if (!Number.isInteger(quantityValue) || quantityValue <= 0) {
      setErrorMessage("A quantidade deve ser um número inteiro maior que zero.");
      return;
    }
    if (!requesterName.trim() || !requesterDepartment.trim()) {
      setErrorMessage("Informe o nome e o setor do solicitante.");
      return;
    }
    if (!signature.length) {
      setErrorMessage("Colete a assinatura do solicitante antes de continuar.");
      return;
    }
    setErrorMessage("");
    setShowReview(true);
  };

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-[#F4F8F8]" safeAreaClassName="bg-[#F4F8F8]">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <View style={styles.brandRow}>
              <View style={styles.brandMark}>
                <Image resizeMode="contain" source={require("@/assets/images/icon.png")} style={styles.brandLogo} />
              </View>
              <View>
                <Text style={styles.eyebrow}>CREC ALMOXARIFADO</Text>
                <Text style={styles.screenTitle}>Registrar saída</Text>
              </View>
            </View>
            <View style={styles.headerStatus}>
              <View style={styles.onlineDot} />
              <Text numberOfLines={1} style={styles.headerStatusText}>{user?.name || "Operador"}</Text>
              <Pressable accessibilityLabel="Sair da conta" onPress={() => void logout()} style={styles.logoutButton}>
                <Ionicons name="log-out-outline" size={15} color="#18795A" />
              </Pressable>
            </View>
          </View>

          <View style={styles.statusBanner}>
            <View style={styles.statusIcon}>
              <Ionicons name="shield-checkmark-outline" size={19} color="#0C5666" />
            </View>
            <View style={styles.statusCopy}>
              <Text style={styles.statusTitle}>Modo de teste — sem movimentação</Text>
              <Text style={styles.statusSubtitle}>
                QR, dados e assinatura ficam locais; nenhuma saída será enviada.
              </Text>
            </View>
          </View>

          <SiteConnectionPanel key={user?.openId || "anonymous"} operatorKey={user?.openId || ""} />

          {errorMessage ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={19} color="#A63D40" />
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <StepMarker number="01" label="IDENTIFICAÇÃO" />
            <Text style={styles.sectionHint}>Obrigatório</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View>
                <Text style={styles.cardTitle}>Encontre o equipamento</Text>
                <Text style={styles.cardHint}>Leia o QR Code ou selecione na lista.</Text>
              </View>
              <Ionicons name="scan-outline" size={24} color="#0C5666" />
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowScanner(true)}
              style={({ pressed }) => [styles.scanButton, pressed && styles.pressed]}
            >
              <Ionicons name="camera-outline" size={20} color="#FFFFFF" />
              <Text style={styles.scanButtonText}>Ler QR Code</Text>
              <View style={styles.scanButtonArrow}>
                <Ionicons name="arrow-forward" size={15} color="#79DCC0" />
              </View>
            </Pressable>

            <View style={styles.dividerLabel}>
              <View style={styles.divider} />
              <Text style={styles.orText}>ou preencha manualmente</Text>
              <View style={styles.divider} />
            </View>

            <FieldLabel required>Código do equipamento</FieldLabel>
            <TextInput
              autoCapitalize="characters"
              onChangeText={(value) => {
                const resolved = resolveEquipment(value);
                setEquipmentCode(value.toUpperCase());
                if (resolved.name) setEquipmentName(resolved.name);
              }}
              placeholder="Ex.: EQP-001"
              placeholderTextColor="#9AAEB2"
              style={styles.textInput}
              value={equipmentCode}
            />
            <View style={styles.inlineFieldHeader}>
              <FieldLabel required>Equipamento</FieldLabel>
              <Pressable onPress={() => setShowEquipmentPicker(true)}>
                <Text style={styles.selectText}>Selecionar da lista</Text>
              </Pressable>
            </View>
            <TextInput
              onChangeText={setEquipmentName}
              placeholder="Nome ou descrição do equipamento"
              placeholderTextColor="#9AAEB2"
              style={styles.textInput}
              value={equipmentName}
            />
          </View>

          <View style={styles.sectionHeader}>
            <StepMarker number="02" label="QUANTIDADE" />
            <Text style={styles.sectionHint}>Unidades</Text>
          </View>
          <View style={styles.cardCompact}>
            <View style={styles.quantityCopy}>
              <Text style={styles.cardTitle}>Quanto será retirado?</Text>
              <Text style={styles.cardHint}>Use números inteiros.</Text>
            </View>
            <View style={styles.stepper}>
              <Pressable
                accessibilityLabel="Diminuir quantidade"
                onPress={() => setQuantity(String(Math.max(1, stepperQuantity - 1)))}
                style={styles.stepperButton}
              >
                <Ionicons name="remove" size={18} color="#0C5666" />
              </Pressable>
              <TextInput
                keyboardType="number-pad"
                onChangeText={setQuantity}
                selectTextOnFocus
                style={styles.quantityInput}
                value={quantity}
              />
              <Pressable
                accessibilityLabel="Aumentar quantidade"
                onPress={() => setQuantity(String(stepperQuantity + 1))}
                style={styles.stepperButton}
              >
                <Ionicons name="add" size={18} color="#0C5666" />
              </Pressable>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <StepMarker number="03" label="SOLICITANTE" />
            <Text style={styles.sectionHint}>Quem recebe</Text>
          </View>
          <View style={styles.card}>
            <FieldLabel required>Nome completo</FieldLabel>
            <TextInput
              onChangeText={setRequesterName}
              placeholder="Nome do solicitante"
              placeholderTextColor="#9AAEB2"
              style={styles.textInput}
              value={requesterName}
            />
            <View style={styles.twoColumnRow}>
              <View style={styles.halfField}>
                <FieldLabel>Matrícula</FieldLabel>
                <TextInput
                  onChangeText={setRequesterRegistration}
                  placeholder="Opcional"
                  placeholderTextColor="#9AAEB2"
                  style={styles.textInput}
                  value={requesterRegistration}
                />
              </View>
              <View style={styles.halfField}>
                <FieldLabel required>Setor</FieldLabel>
                <TextInput
                  onChangeText={setRequesterDepartment}
                  placeholder="Ex.: Manutenção"
                  placeholderTextColor="#9AAEB2"
                  style={styles.textInput}
                  value={requesterDepartment}
                />
              </View>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <StepMarker number="04" label="ASSINATURA" />
            <Text style={styles.sectionHint}>Confirmação</Text>
          </View>
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <View>
                <Text style={styles.cardTitle}>Assinatura do solicitante</Text>
                <Text style={styles.cardHint}>Peça para assinar dentro do campo.</Text>
              </View>
              <Ionicons name="create-outline" size={22} color="#0C5666" />
            </View>
            <SignaturePad onChange={setSignature} />
          </View>

          {errorMessage ? (
            <View style={styles.inlineError}>
              <Ionicons name="alert-circle-outline" size={17} color="#A63D40" />
              <Text style={styles.inlineErrorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <View style={styles.footerAction}>
            <PrimaryButton icon="arrow-forward" label="Revisar dados" onPress={validateAndReview} />
            <Text style={styles.footerNote}>
              A revisão é local nesta versão. Nenhuma movimentação será registrada.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal animationType="slide" onRequestClose={() => setShowScanner(false)} transparent visible={showScanner}>
        <View style={styles.modalBackdrop}>
          <View style={styles.scannerSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalEyebrow}>IDENTIFICAÇÃO</Text>
                <Text style={styles.modalTitle}>Aponte para o QR Code</Text>
              </View>
              <Pressable onPress={() => setShowScanner(false)} style={styles.closeButton}>
                <Ionicons name="close" size={22} color="#17363D" />
              </Pressable>
            </View>
            {Platform.OS === "web" ? (
              <View style={styles.webScannerFallback}>
                <Ionicons name="phone-portrait-outline" size={38} color="#0C5666" />
                <Text style={styles.webFallbackTitle}>A câmera funciona no APK Android</Text>
                <Text style={styles.webFallbackText}>Na prévia web, digite o código abaixo para simular a leitura.</Text>
                <TextInput
                  autoCapitalize="characters"
                  onChangeText={(value) => setEquipmentCode(value.toUpperCase())}
                  placeholder="Ex.: EQP-001"
                  placeholderTextColor="#9AAEB2"
                  style={[styles.textInput, styles.webScannerInput]}
                  value={equipmentCode}
                />
                <PrimaryButton icon="checkmark" label="Usar este código" onPress={() => setShowScanner(false)} />
              </View>
            ) : permission?.granted ? (
              <View style={styles.cameraFrame}>
                <CameraView
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={handleBarcodeScanned}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.scanGuide}>
                  <View style={[styles.scanCorner, styles.cornerTopLeft]} />
                  <View style={[styles.scanCorner, styles.cornerTopRight]} />
                  <View style={[styles.scanCorner, styles.cornerBottomLeft]} />
                  <View style={[styles.scanCorner, styles.cornerBottomRight]} />
                </View>
                <Text style={styles.cameraHint}>O código será preenchido automaticamente</Text>
              </View>
            ) : (
              <View style={styles.permissionBox}>
                <Ionicons name="camera-outline" size={34} color="#0C5666" />
                <Text style={styles.webFallbackTitle}>Permita o acesso à câmera</Text>
                <Text style={styles.webFallbackText}>Precisamos da câmera para identificar o equipamento.</Text>
                <PrimaryButton icon="camera" label="Permitir câmera" onPress={() => void requestPermission()} />
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" onRequestClose={() => setShowEquipmentPicker(false)} transparent visible={showEquipmentPicker}>
        <View style={styles.modalBackdrop}>
          <View style={styles.pickerSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalEyebrow}>EQUIPAMENTOS</Text>
                <Text style={styles.modalTitle}>Selecione um item</Text>
              </View>
              <Pressable onPress={() => setShowEquipmentPicker(false)} style={styles.closeButton}>
                <Ionicons name="close" size={22} color="#17363D" />
              </Pressable>
            </View>
            {EQUIPMENT_OPTIONS.map((option) => (
              <Pressable
                key={option.code}
                onPress={() => chooseEquipment(option)}
                style={({ pressed }) => [styles.optionRow, pressed && styles.pressed]}
              >
                <View style={styles.optionIcon}>
                  <Ionicons name="cube-outline" size={19} color="#0C5666" />
                </View>
                <View style={styles.optionCopy}>
                  <Text style={styles.optionName}>{option.name}</Text>
                  <Text style={styles.optionMeta}>{option.code} · {option.category}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#91A2A6" />
              </Pressable>
            ))}
            <Text style={styles.pickerNote}>Itens de demonstração — não são o catálogo do site.</Text>
          </View>
        </View>
      </Modal>

      <Modal animationType="slide" onRequestClose={() => setShowReview(false)} transparent visible={showReview}>
        <View style={styles.modalBackdrop}>
          <View style={styles.reviewSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalEyebrow}>ÚLTIMA CONFERÊNCIA</Text>
                <Text style={styles.modalTitle}>Confira os dados locais</Text>
              </View>
              <Pressable onPress={() => setShowReview(false)} style={styles.closeButton}>
                <Ionicons name="close" size={22} color="#17363D" />
              </Pressable>
            </View>
            <View style={styles.reviewHero}>
              <View style={styles.reviewHeroIcon}>
                <Ionicons name="cube-outline" size={22} color="#79DCC0" />
              </View>
              <View style={styles.reviewHeroCopy}>
                <Text style={styles.reviewHeroName}>{equipmentName}</Text>
                <Text style={styles.reviewHeroCode}>{equipmentCode} · {quantity} unidade(s)</Text>
              </View>
            </View>
            <View style={styles.reviewRows}>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Solicitante</Text>
                <Text style={styles.reviewValue}>{requesterName}</Text>
              </View>
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Setor</Text>
                <Text style={styles.reviewValue}>{requesterDepartment}</Text>
              </View>
              {requesterRegistration ? (
                <View style={styles.reviewRow}>
                  <Text style={styles.reviewLabel}>Matrícula</Text>
                  <Text style={styles.reviewValue}>{requesterRegistration}</Text>
                </View>
              ) : null}
              <View style={styles.reviewRow}>
                <Text style={styles.reviewLabel}>Assinatura</Text>
                <Text style={styles.reviewValue}>Coletada na tela</Text>
              </View>
            </View>
            <View style={styles.reviewTestNotice}>
              <Ionicons name="eye-outline" size={19} color="#0C5666" />
              <View style={styles.reviewTestCopy}>
                <Text style={styles.reviewTestTitle}>Revisão local — sem movimentação</Text>
                <Text style={styles.reviewTestText}>
                  Esta versão de teste não envia solicitações, assinaturas ou documentos e não altera o estoque.
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowReview(false)}
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonMuted]}
            >
              <Ionicons name="arrow-back" size={18} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Fechar e revisar</Text>
            </Pressable>
            <Text style={styles.reviewNote}>Revise os dados no aparelho. Nenhuma movimentação será registrada nesta versão.</Text>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 36, maxWidth: 720, width: "100%", alignSelf: "center" },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  brandMark: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF", overflow: "hidden", borderWidth: 1, borderColor: "#DCE8E9" },
  brandLogo: { width: 38, height: 38 },
  eyebrow: { color: "#6F858A", fontSize: 10, fontWeight: "800", letterSpacing: 1.3 },
  screenTitle: { color: "#17363D", fontSize: 27, lineHeight: 32, fontWeight: "800", letterSpacing: -0.6 },
  headerStatus: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999, backgroundColor: "#E5F5F0" },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#21A375" },
  headerStatusText: { color: "#18795A", fontSize: 12, fontWeight: "700" },
  logoutButton: { paddingLeft: 3, paddingVertical: 2 },
  statusBanner: { flexDirection: "row", alignItems: "center", padding: 14, borderRadius: 18, backgroundColor: "#DDF1EC", marginBottom: 18 },
  statusIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: "#BEE4DA", alignItems: "center", justifyContent: "center" },
  statusCopy: { flex: 1, marginLeft: 11 },
  statusTitle: { color: "#0C5666", fontSize: 15, fontWeight: "800" },
  statusSubtitle: { color: "#48737A", fontSize: 12, marginTop: 2 },
  newOperationButton: { paddingHorizontal: 10, paddingVertical: 8 },
  newOperationText: { color: "#0C5666", fontSize: 12, fontWeight: "800" },
  errorBanner: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 13, backgroundColor: "#FCEBEC", marginBottom: 18 },
  errorBannerText: { color: "#8B3D40", fontSize: 12, lineHeight: 18, flex: 1 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, marginTop: 4 },
  stepMarker: { flexDirection: "row", alignItems: "center", gap: 9 },
  stepNumber: { width: 30, height: 30, borderRadius: 10, backgroundColor: "#0C5666", alignItems: "center", justifyContent: "center" },
  stepNumberText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  stepLabel: { color: "#48666C", fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  sectionHint: { color: "#91A2A6", fontSize: 11, fontWeight: "600" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 20, padding: 17, marginBottom: 17, borderWidth: 1, borderColor: "#E4EEEE", shadowColor: "#0C5666", shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.04, shadowRadius: 12, elevation: 1 },
  cardCompact: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#FFFFFF", borderRadius: 20, padding: 17, marginBottom: 17, borderWidth: 1, borderColor: "#E4EEEE" },
  cardHeaderRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14 },
  cardTitle: { color: "#17363D", fontSize: 16, fontWeight: "800" },
  cardHint: { color: "#84999D", fontSize: 12, marginTop: 4 },
  scanButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, minHeight: 52, borderRadius: 15, backgroundColor: "#0C5666", paddingHorizontal: 14 },
  scanButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800", flex: 1 },
  scanButtonArrow: { width: 29, height: 29, borderRadius: 10, backgroundColor: "#174F5C", alignItems: "center", justifyContent: "center" },
  dividerLabel: { flexDirection: "row", alignItems: "center", gap: 9, marginVertical: 15 },
  divider: { height: 1, backgroundColor: "#EBF0F1", flex: 1 },
  orText: { color: "#9AAEB2", fontSize: 11 },
  fieldLabel: { color: "#587278", fontSize: 11, fontWeight: "800", marginBottom: 7, textTransform: "uppercase", letterSpacing: 0.6 },
  required: { color: "#B64B4F" },
  textInput: { minHeight: 46, borderWidth: 1, borderColor: "#DCE8E9", borderRadius: 12, paddingHorizontal: 13, color: "#17363D", fontSize: 14, backgroundColor: "#FBFDFD", marginBottom: 13 },
  inlineFieldHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  selectText: { color: "#0C5666", fontSize: 11, fontWeight: "800", marginBottom: 7 },
  quantityCopy: { flex: 1 },
  stepper: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: "#DCE8E9", borderRadius: 13, overflow: "hidden", marginLeft: 12 },
  stepperButton: { width: 38, height: 42, alignItems: "center", justifyContent: "center", backgroundColor: "#F1F8F7" },
  quantityInput: { width: 45, height: 42, textAlign: "center", color: "#17363D", fontSize: 17, fontWeight: "900" },
  twoColumnRow: { flexDirection: "row", gap: 10 },
  halfField: { flex: 1 },
  footerAction: { marginTop: 2, alignItems: "center" },
  primaryButton: { minHeight: 52, borderRadius: 15, backgroundColor: "#0C5666", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 9, paddingHorizontal: 18, width: "100%" },
  primaryButtonMuted: { opacity: 0.55 },
  primaryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  footerNote: { color: "#91A2A6", fontSize: 11, marginTop: 10 },
  inlineError: { flexDirection: "row", alignItems: "flex-start", gap: 7, paddingHorizontal: 3, marginBottom: 14 },
  inlineErrorText: { color: "#A63D40", fontSize: 12, flex: 1, lineHeight: 17 },
  pressed: { opacity: 0.75 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(17, 39, 44, 0.48)" },
  scannerSheet: { minHeight: 520, backgroundColor: "#F7FBFB", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20 },
  pickerSheet: { backgroundColor: "#F7FBFB", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 28 },
  reviewSheet: { backgroundColor: "#F7FBFB", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 28 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 17 },
  modalEyebrow: { color: "#6F858A", fontSize: 10, fontWeight: "900", letterSpacing: 1.2, marginBottom: 3 },
  modalTitle: { color: "#17363D", fontSize: 22, fontWeight: "800", letterSpacing: -0.4 },
  closeButton: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#EAF2F2", alignItems: "center", justifyContent: "center" },
  cameraFrame: { height: 385, borderRadius: 20, overflow: "hidden", backgroundColor: "#163A40", alignItems: "center", justifyContent: "center" },
  scanGuide: { width: 230, height: 230, position: "relative" },
  scanCorner: { width: 38, height: 38, position: "absolute", borderColor: "#79DCC0" },
  cornerTopLeft: { left: 0, top: 0, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 9 },
  cornerTopRight: { right: 0, top: 0, borderRightWidth: 4, borderTopWidth: 4, borderTopRightRadius: 9 },
  cornerBottomLeft: { left: 0, bottom: 0, borderLeftWidth: 4, borderBottomWidth: 4, borderBottomLeftRadius: 9 },
  cornerBottomRight: { right: 0, bottom: 0, borderRightWidth: 4, borderBottomWidth: 4, borderBottomRightRadius: 9 },
  cameraHint: { position: "absolute", bottom: 18, color: "#FFFFFF", fontSize: 12, backgroundColor: "rgba(12, 86, 102, 0.8)", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  permissionBox: { minHeight: 340, borderRadius: 20, backgroundColor: "#EAF4F3", alignItems: "center", justifyContent: "center", padding: 25 },
  webScannerFallback: { minHeight: 340, borderRadius: 20, backgroundColor: "#EAF4F3", alignItems: "center", justifyContent: "center", padding: 25 },
  webFallbackTitle: { color: "#17363D", fontSize: 16, fontWeight: "800", textAlign: "center", marginTop: 11 },
  webFallbackText: { color: "#658086", fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 6, marginBottom: 18, maxWidth: 300 },
  webScannerInput: { width: "100%", maxWidth: 300, marginBottom: 4 },
  optionRow: { flexDirection: "row", alignItems: "center", paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#E4EEEE" },
  optionIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#DDF1EC", alignItems: "center", justifyContent: "center" },
  optionCopy: { flex: 1, marginLeft: 11 },
  optionName: { color: "#17363D", fontSize: 14, fontWeight: "800" },
  optionMeta: { color: "#84999D", fontSize: 11, marginTop: 3 },
  pickerNote: { color: "#91A2A6", fontSize: 11, lineHeight: 17, marginTop: 15 },
  reviewHero: { flexDirection: "row", alignItems: "center", backgroundColor: "#DDF1EC", borderRadius: 17, padding: 13, marginBottom: 17 },
  reviewHeroIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: "#0C5666", alignItems: "center", justifyContent: "center" },
  reviewHeroCopy: { flex: 1, marginLeft: 11 },
  reviewHeroName: { color: "#0C5666", fontSize: 16, fontWeight: "900" },
  reviewHeroCode: { color: "#48737A", fontSize: 12, marginTop: 4 },
  reviewTestNotice: { alignItems: "flex-start", backgroundColor: "#DDF1EC", borderRadius: 14, flexDirection: "row", gap: 9, marginBottom: 14, padding: 12 },
  reviewTestCopy: { flex: 1 },
  reviewTestTitle: { color: "#0C5666", fontSize: 13, fontWeight: "900" },
  reviewTestText: { color: "#48737A", fontSize: 11, lineHeight: 17, marginTop: 4 },
  reviewRows: { backgroundColor: "#FFFFFF", borderRadius: 16, paddingHorizontal: 14, marginBottom: 16, borderWidth: 1, borderColor: "#E4EEEE" },
  reviewRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#EFF3F3" },
  reviewLabel: { color: "#84999D", fontSize: 12 },
  reviewValue: { color: "#17363D", fontSize: 13, fontWeight: "800", maxWidth: "62%", textAlign: "right" },
  reviewError: { flexDirection: "row", alignItems: "flex-start", gap: 7, backgroundColor: "#FCEBEC", borderRadius: 12, padding: 11, marginBottom: 13 },
  reviewErrorText: { color: "#8B3D40", fontSize: 12, lineHeight: 17, flex: 1 },
  reviewNote: { color: "#91A2A6", fontSize: 11, textAlign: "center", marginTop: 10 },
});
