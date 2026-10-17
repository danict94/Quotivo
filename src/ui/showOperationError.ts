import { Alert } from 'react-native';

export function showError(error: unknown) {
  Alert.alert('Operazione non riuscita', error instanceof Error ? error.message : 'Si è verificato un errore.');
}
