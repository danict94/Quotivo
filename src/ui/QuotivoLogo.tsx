import { Asset } from 'expo-asset';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { SvgUri } from 'react-native-svg';

const master = Asset.fromModule(require('../../asset/quotivo-logo-master.svg'));
const mark = Asset.fromModule(require('../../asset/quotivo-mark.svg'));

function useLocalAssetUri(asset: Asset, androidAssetName: string): string | null {
  const androidUri = `file:///android_asset/${androidAssetName}`;
  const [uri, setUri] = useState<string | null>(Platform.OS === 'android' ? androidUri : asset.localUri);

  useEffect(() => {
    if (Platform.OS === 'android') {
      setUri(androidUri);
      return;
    }

    let mounted = true;

    void asset.downloadAsync().then((downloadedAsset) => {
      if (mounted) setUri(downloadedAsset.localUri ?? downloadedAsset.uri);
    }).catch(() => {
      if (mounted) setUri(null);
    });

    return () => { mounted = false; };
  }, [androidUri, asset]);

  return uri;
}

export function QuotivoLogo({ width = 156 }: { width?: number }) {
  const uri = useLocalAssetUri(master, 'quotivo_logo_master.svg');
  return uri ? <SvgUri uri={uri} width={width} height={width * 132 / 520} /> : null;
}

export function QuotivoMark({ size = 48 }: { size?: number }) {
  const uri = useLocalAssetUri(mark, 'quotivo_mark.svg');
  return uri ? <SvgUri uri={uri} width={size} height={size} /> : null;
}
