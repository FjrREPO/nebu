import type { AgentTable } from "@nebu/core";
import { Column, Row, Text } from "@once-ui-system/core";
import { Frame } from "./Frame";
import { SpecLabel } from "./SpecLabel";

/**
 * The agent's working data. Wide tables scroll inside the frame rather than
 * pushing the page sideways.
 */
export function DataTable({ table }: { table: AgentTable }) {
  return (
    <Column fillWidth gap="12">
      <Row fillWidth horizontal="between" vertical="end" gap="16" wrap>
        <Text variant="heading-strong-s">{table.title}</Text>
        <SpecLabel>{table.rows.length} rows</SpecLabel>
      </Row>
      {table.caption && (
        <Text variant="body-default-s" onBackground="neutral-weak">
          {table.caption}
        </Text>
      )}
      <Frame fillWidth radius="m" paddingY="20" overflowX="auto">
        <table className="data-table">
          <thead>
            <tr>
              {table.columns.map((column) => (
                <th key={column.key} className={column.align === "end" ? "numeric" : undefined}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.id}>
                {table.columns.map((column, index) => (
                  <td
                    key={column.key}
                    className={[column.align === "end" ? "numeric" : "", index === 0 ? "lead" : ""]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {index === 0 && (row.logo || row.logoAlt) && (
                      <span className="pair-logos">
                        {/* biome-ignore lint/performance/noImgElement: 20px CDN token marks, optimisation would cost more than it saves */}
                        {row.logo && <img src={row.logo} alt="" loading="lazy" />}
                        {/* biome-ignore lint/performance/noImgElement: same */}
                        {row.logoAlt && <img src={row.logoAlt} alt="" loading="lazy" />}
                      </span>
                    )}
                    {row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {table.rows.length === 0 && (
          <Row fillWidth horizontal="center" paddingY="24">
            <Text variant="body-default-s" onBackground="neutral-weak">
              Nothing matched in the window scanned.
            </Text>
          </Row>
        )}
      </Frame>
    </Column>
  );
}
