const fs = require("node:fs");
const path = require("node:path");
const { withDangerousMod } = require("expo/config-plugins");

/**
 * Overrides react-native-screens' short 200ms Android fragment transitions with Apple-calibrated
 * cubic curves (fast frame-1 launch + velvety deceleration), -28% parallax background glide,
 * subtle OLED depth dim, and top z-order during back pop so push/back navigation feels like iOS.
 */

const IOS_NAV_CURVE_XML = `<?xml version="1.0" encoding="utf-8"?>
<pathInterpolator xmlns:android="http://schemas.android.com/apk/res/android"
    android:controlX1="0.22"
    android:controlY1="1.0"
    android:controlX2="0.36"
    android:controlY2="1.0" />
`;

const IOS_MODAL_CURVE_XML = `<?xml version="1.0" encoding="utf-8"?>
<pathInterpolator xmlns:android="http://schemas.android.com/apk/res/android"
    android:controlX1="0.25"
    android:controlY1="0.92"
    android:controlX2="0.32"
    android:controlY2="1.0" />
`;

const ANIM_OVERRIDES = {
  "rns_ios_from_right_foreground_open.xml": `<?xml version="1.0" encoding="utf-8"?>
<translate xmlns:android="http://schemas.android.com/apk/res/android"
    android:duration="370"
    android:interpolator="@interpolator/ios_nav_curve"
    android:fromXDelta="100%"
    android:toXDelta="0%"
    android:zAdjustment="top" />
`,
  "rns_ios_from_right_background_open.xml": `<?xml version="1.0" encoding="utf-8"?>
<set xmlns:android="http://schemas.android.com/apk/res/android"
    android:shareInterpolator="true"
    android:interpolator="@interpolator/ios_nav_curve">
  <translate
      android:duration="370"
      android:fromXDelta="0%"
      android:toXDelta="-28%" />
  <alpha
      android:duration="370"
      android:fromAlpha="1.0"
      android:toAlpha="0.84" />
</set>
`,
  "rns_ios_from_right_foreground_close.xml": `<?xml version="1.0" encoding="utf-8"?>
<translate xmlns:android="http://schemas.android.com/apk/res/android"
    android:duration="335"
    android:interpolator="@interpolator/ios_nav_curve"
    android:fromXDelta="0%"
    android:toXDelta="100%"
    android:zAdjustment="top" />
`,
  "rns_ios_from_right_background_close.xml": `<?xml version="1.0" encoding="utf-8"?>
<set xmlns:android="http://schemas.android.com/apk/res/android"
    android:shareInterpolator="true"
    android:interpolator="@interpolator/ios_nav_curve">
  <translate
      android:duration="335"
      android:fromXDelta="-28%"
      android:toXDelta="0%" />
  <alpha
      android:duration="335"
      android:fromAlpha="0.84"
      android:toAlpha="1.0" />
</set>
`,
  "rns_slide_in_from_bottom.xml": `<?xml version="1.0" encoding="utf-8"?>
<translate xmlns:android="http://schemas.android.com/apk/res/android"
    android:duration="360"
    android:interpolator="@interpolator/ios_modal_curve"
    android:fromYDelta="100%"
    android:toYDelta="0%"
    android:zAdjustment="top" />
`,
  "rns_slide_out_to_bottom.xml": `<?xml version="1.0" encoding="utf-8"?>
<translate xmlns:android="http://schemas.android.com/apk/res/android"
    android:duration="290"
    android:interpolator="@interpolator/ios_modal_curve"
    android:fromYDelta="0%"
    android:toYDelta="100%"
    android:zAdjustment="top" />
`,
  "rns_fade_in.xml": `<?xml version="1.0" encoding="utf-8"?>
<alpha xmlns:android="http://schemas.android.com/apk/res/android"
    android:duration="200"
    android:interpolator="@interpolator/ios_modal_curve"
    android:fromAlpha="0.0"
    android:toAlpha="1.0" />
`,
  "rns_fade_out.xml": `<?xml version="1.0" encoding="utf-8"?>
<alpha xmlns:android="http://schemas.android.com/apk/res/android"
    android:duration="170"
    android:interpolator="@interpolator/ios_modal_curve"
    android:fromAlpha="1.0"
    android:toAlpha="0.0" />
`,
};

module.exports = function withAndroidIosMotion(config) {
  return withDangerousMod(config, [
    "android",
    async (nextConfig) => {
      const resRoot = path.join(
        nextConfig.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
      );
      const interpolatorDir = path.join(resRoot, "interpolator");
      const animDir = path.join(resRoot, "anim");
      fs.mkdirSync(interpolatorDir, { recursive: true });
      fs.mkdirSync(animDir, { recursive: true });

      fs.writeFileSync(path.join(interpolatorDir, "ios_nav_curve.xml"), IOS_NAV_CURVE_XML);
      fs.writeFileSync(path.join(interpolatorDir, "ios_modal_curve.xml"), IOS_MODAL_CURVE_XML);

      for (const [filename, xml] of Object.entries(ANIM_OVERRIDES)) {
        fs.writeFileSync(path.join(animDir, filename), xml);
      }

      return nextConfig;
    },
  ]);
};
