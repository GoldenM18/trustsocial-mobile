const {
  withAndroidManifest,
  withDangerousMod,
} = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withNetworkSecurityConfig(config) {
  config = withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];

    if (application) {
      application.$['android:usesCleartextTraffic'] = 'true';
      application.$['android:networkSecurityConfig'] =
        '@xml/network_security_config';
    }

    return config;
  });

  return withDangerousMod(config, [
    'android',
    async (config) => {
      const resXmlDir = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
        'xml'
      );

      fs.mkdirSync(resXmlDir, { recursive: true });

      fs.writeFileSync(
        path.join(resXmlDir, 'network_security_config.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`
      );

      return config;
    },
  ]);
}

module.exports = withNetworkSecurityConfig;
