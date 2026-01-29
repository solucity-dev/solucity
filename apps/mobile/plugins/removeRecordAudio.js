const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function removeRecordAudio(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    manifest.$ = manifest.$ || {};
    manifest.$['xmlns:tools'] = manifest.$['xmlns:tools'] || 'http://schemas.android.com/tools';

    manifest['uses-permission'] = manifest['uses-permission'] || [];
    manifest['uses-permission-sdk-23'] = manifest['uses-permission-sdk-23'] || [];

    manifest['uses-permission'] = manifest['uses-permission'].filter(
      (p) => p?.$?.['android:name'] !== 'android.permission.RECORD_AUDIO',
    );

    manifest['uses-permission-sdk-23'] = manifest['uses-permission-sdk-23'].filter(
      (p) => p?.$?.['android:name'] !== 'android.permission.RECORD_AUDIO',
    );

    manifest['uses-permission'].push({
      $: {
        'android:name': 'android.permission.RECORD_AUDIO',
        'tools:node': 'remove',
      },
    });

    manifest['uses-permission-sdk-23'].push({
      $: {
        'android:name': 'android.permission.RECORD_AUDIO',
        'tools:node': 'remove',
      },
    });

    return config;
  });
};
