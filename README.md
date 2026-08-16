# K-Waiter 3 for iOS

نسخة iPad المستقلة من تطبيق K-Waiter 3، مبنية باستخدام Vue 3 وTypeScript وCapacitor 8، وتتصل بخادم Kemet Restaurant عبر API V3.

This repository contains the iPadOS source for K-Waiter 3. It includes the shared Vue application, the Capacitor iOS project, native Swift plugins, tests, App Store assets, and release documentation. Android source and signing credentials are intentionally excluded.

## المتطلبات

- جهاز Mac بإصدار حديث من macOS.
- Xcode متوافق مع Capacitor 8.
- Node.js وnpm.
- حساب Apple Developer وفريق توقيع صالحان للنشر.

## تجهيز المشروع

```bash
npm ci
npm run check
npm run prepare:ios
npm run ios:open
```

بعد فتح المشروع في Xcode:

1. اختر فريق Apple Developer الصحيح من Signing & Capabilities.
2. تأكد أن Bundle Identifier هو `com.microsolution.kwaiter3`.
3. اختبر التطبيق على iPad حقيقي والطباعة عبر AirPrint.
4. استخدم Product > Archive ثم ارفع النسخة إلى App Store Connect.

## ملفات مهمة

- دليل إصدار App Store: [`docs/ios-app-store-release-ar.md`](docs/ios-app-store-release-ar.md)
- بيانات المتجر بالعربية والإنجليزية: [`docs/app-store-metadata-ar-en.md`](docs/app-store-metadata-ar-en.md)
- سياسة الخصوصية: [`docs/privacy-policy-ar-en.md`](docs/privacy-policy-ar-en.md)
- قائمة التحقق النهائية: [`docs/release-checklist-ar.md`](docs/release-checklist-ar.md)

## الحماية

لا يحتوي المستودع على شهادات Apple أو ملفات provisioning أو مفاتيح خاصة. تُضاف بيانات التوقيع محليًا على جهاز Mac أو عبر أسرار نظام CI فقط.
