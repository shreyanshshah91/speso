// Android Auto Backup rules for Speso.
//
// Google backup may copy exactly one thing: the app's `files/kova-backup/` folder, which holds a
// single backup file encrypted with the user's backup password (see src/lib/cloud-backup.ts).
// Listing an <include> means everything else is left out, so the SQLCipher database, the
// SharedPreferences used by expo-secure-store and all caches are never backed up.
const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const FULL_BACKUP_RULES = `<?xml version="1.0" encoding="utf-8"?>
<!-- Android 11 and older -->
<full-backup-content>
    <include domain="file" path="kova-backup/" />
</full-backup-content>
`;

const DATA_EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<!-- Android 12 and newer: cloud backup and phone-to-phone transfer -->
<data-extraction-rules>
    <cloud-backup>
        <include domain="file" path="kova-backup/" />
    </cloud-backup>
    <device-transfer>
        <include domain="file" path="kova-backup/" />
    </device-transfer>
</data-extraction-rules>
`;

module.exports = function withAndroidBackup(config) {
  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$['android:allowBackup'] = 'true';
    app.$['android:fullBackupContent'] = '@xml/kova_backup_rules';
    app.$['android:dataExtractionRules'] = '@xml/kova_data_extraction_rules';
    return cfg;
  });
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'kova_backup_rules.xml'), FULL_BACKUP_RULES);
      fs.writeFileSync(path.join(dir, 'kova_data_extraction_rules.xml'), DATA_EXTRACTION_RULES);
      return cfg;
    },
  ]);
  return config;
};
