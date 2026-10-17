import { Asset } from 'expo-asset';
import { useEffect, useState } from 'react';
import { SvgUri } from 'react-native-svg';

const master = Asset.fromModule(require('../../asset/quotivo-logo-master.svg'));
const mark = Asset.fromModule(require('../../asset/quotivo-mark.svg'));

function useLocalAssetUri(asset: Asset): string | null {
  const [uri, setUri] = useState<string | null>(asset.localUri);

  useEffect(() => {
    let mounted = true;

    void asset.downloadAsync().then((downloadedAsset) => {
      if (mounted) setUri(downloadedAsset.localUri ?? downloadedAsset.uri);
    }).catch(() => {
      if (mounted) setUri(null);
    });

    return () => { mounted = false; };
  }, [asset]);

  return uri;
}

export function QuotivoLogo({ width = 156 }: { width?: number }) {
  const uri = useLocalAssetUri(master);
  return uri ? <SvgUri uri={uri} width={width} height={width * 132 / 520} /> : null;
}

export function QuotivoMark({ size = 48 }: { size?: number }) {
  const uri = useLocalAssetUri(mark);
  return uri ? <SvgUri uri={uri} width={size} height={size} /> : null;
}
