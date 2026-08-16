<script setup lang="ts">
import { onMounted, reactive } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/app/stores/auth';
import { useSettingsStore } from '@/app/stores/settings';
import { appPreferences } from '@/app/services/preferences';
import { DEMO_MODE_ENABLED } from '@/app/config/features';

const auth = useAuthStore();
const settings = useSettingsStore();
const router = useRouter();
const route = useRoute();
const demoEnabled = DEMO_MODE_ENABLED;
const form = reactive({ serverUrl: '', username: '', password: '', deviceName: settings.settings.deviceName });

onMounted(async () => { form.serverUrl = await appPreferences.getServerUrl(); });

async function submit(): Promise<void> {
  try {
    await auth.login(form);
    await settings.load(true);
    await router.replace(typeof route.query.redirect === 'string' ? route.query.redirect : '/');
  } catch { /* Error is rendered from the store. */ }
}

async function demo(): Promise<void> {
  try { await auth.loginDemo(); await settings.load(true); await router.replace('/'); }
  catch { /* Error is rendered from the store. */ }
}
</script>

<template>
  <div class="login-page">
    <section class="login-visual">
      <div>
        <div class="brand-mark">K</div>
        <h1>K-Waiter 3</h1>
        <p>واجهة أسرع للجارسون، تعمل حتى عند ضعف الإنترنت وتحافظ على كل طلب.</p>
        <div class="login-points">
          <div class="login-point"><span>✓</span> نقطة بيع مصممة للتابلت</div>
          <div class="login-point"><span>✓</span> عملاء وعناوين دون خطوات زائدة</div>
          <div class="login-point"><span>✓</span> أوفلاين ومزامنة آمنة بلا طلبات مكررة</div>
        </div>
      </div>
    </section>
    <section class="login-form-wrap">
      <form class="login-card stack" @submit.prevent="submit">
        <div class="logo">K</div>
        <div><h1>تسجيل الدخول</h1><p class="muted">أدخل بيانات السيرفر وحساب الجارسون</p></div>
        <label class="field"><span>رابط السيرفر</span><input v-model.trim="form.serverUrl" type="url" inputmode="url" placeholder="https://example.com" required /></label>
        <label class="field"><span>اسم المستخدم</span><input v-model.trim="form.username" autocomplete="username" required /></label>
        <label class="field"><span>كلمة المرور</span><input v-model="form.password" type="password" autocomplete="current-password" required /></label>
        <label class="field"><span>اسم التابلت</span><input v-model.trim="form.deviceName" required /></label>
        <p v-if="auth.error" class="error-text">{{ auth.error }}</p>
        <button class="btn btn-primary btn-block" :disabled="auth.busy">{{ auth.busy ? 'جاري الاتصال…' : 'دخول' }}</button>
        <button v-if="demoEnabled" type="button" class="btn btn-secondary btn-block" :disabled="auth.busy" @click="demo">فتح النسخة التجريبية</button>
      </form>
    </section>
  </div>
</template>
