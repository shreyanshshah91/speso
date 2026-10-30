import { Children, Fragment } from 'react';
import { View } from 'react-native';

import { Card, Divider } from '@/components/ui/card';
import { T } from '@/components/ui/text';

/** Titled group of settings rows rendered as one rounded card with dividers. */
export function Section({ title, children, footer }: { title?: string; children: React.ReactNode; footer?: string }) {
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={{ marginTop: 22 }}>
      {title ? (
        <T variant="small" tone="secondary" style={{ marginLeft: 2, marginBottom: 8, fontSize: 16 }}>
          {title}
        </T>
      ) : null}
      <Card style={{ borderRadius: 24 }}>
        {items.map((child, i) => (
          <Fragment key={i}>
            {i > 0 ? <Divider /> : null}
            {child}
          </Fragment>
        ))}
      </Card>
      {footer ? (
        <T variant="caption" tone="tertiary" style={{ marginTop: 8, marginHorizontal: 4 }}>
          {footer}
        </T>
      ) : null}
    </View>
  );
}
