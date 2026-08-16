# تجهيز iPad وApp Store

المشروع مضبوط لـ iPad فقط، Bundle ID هو `com.microsolution.kwaiter3`، الإصدار التسويقي `3.0.0` والبناء `300014`. يدعم Portrait وLandscape، ويحتوي App Icon وPrivacy Manifest وملحق AirPrint والطباعة المحلية TCP.

## التحضير على Windows

```powershell
npm ci
npm run check
npm run prepare:ios
```

## البناء على Mac

ابتداءً من 28 أبريل 2026 يجب استخدام Xcode يحتوي iOS/iPadOS 26 SDK أو أحدث عند الرفع. على Mac:

```bash
npm ci
npm run prepare:ios
npx cap open ios
```

داخل Xcode اختر Apple Developer Team للشركة، وتأكد أن Bundle ID مسجل في الحساب. اختبر على iPad حقيقي: تسجيل الدخول، SQLite/Keychain، الاتجاهين، AirPrint، TCP داخل الشبكة المحلية، الأوفلاين ثم المزامنة. بعد ذلك أنشئ Archive وارفعه إلى TestFlight أولًا.

## ما يحتاج حساب الشركة

- عضوية Apple Developer فعالة واتفاقيات موقعة.
- App record باسم `K-Waiter` وBundle ID مطابق.
- Team/Certificate/Provisioning Profile.
- رابط سياسة الخصوصية وبيانات الدعم.
- حساب مراجعة تجريبي صالح.
- إجابات App Privacy ولقطات iPad الموجودة في `release/store-assets/screenshots`.

لا يمكن إنشاء IPA أو رفعه من Windows لأن Xcode والتوقيع متاحان على macOS فقط.
