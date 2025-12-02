import mysql, { RowDataPacket } from 'mysql2/promise';

const OLD_URL = 'https://dramaflow-ai.s3.ap-northeast-1.amazonaws.com';
const NEW_URL = 'https://video-cat.oss-cn-shanghai.aliyuncs.com';

interface SchemeManageRow extends RowDataPacket {
  id: number;
  cover?: string | null;
  summary?: string | null;
  event_table?: string | null;
  role_table?: string | null;
  fragment_table?: string | null;
  material_pack?: string | null;
}

const pool = mysql.createPool({
  host: '106.14.122.127',
  user: 'root',
  password: 'mysql_sJHran',
  database: 'editing-assistant',
  waitForConnections: true,
  connectionLimit: 10,
});

// function replaceUrlInObject(obj: any) {
//   if (obj?.audioUrl) {
//     for (const key of Object.keys(obj.audioUrl)) {
//       if (typeof obj.audioUrl[key] === 'string') {
//         obj.audioUrl[key] = obj.audioUrl[key].replaceAll(OLD_URL, NEW_URL)
//       }
//     }
//   }
//   return obj
// }

async function main() {
  const [rows] = await pool.query<SchemeManageRow[]>(
    `SELECT id, material_pack FROM sys_film_library`,
  );

  for (const row of rows) {
    const { id, material_pack } = row;

    if (!material_pack) continue;

    // let parsed: any[]
    try {
      // parsed = JSON.parse(material_pack)
      // if (!Array.isArray(parsed)) continue

      // const replaced = parsed.map(replaceUrlInObject)
      const newUrl = material_pack.replace(OLD_URL, NEW_URL);
      // const newSummary = material_pack.replace(OLD_URL, NEW_URL)
      // const newEventTable = material_pack.replace(OLD_URL, NEW_URL)
      // const newRoleTable = material_pack.replace(OLD_URL, NEW_URL)
      // const newFragmentTable = material_pack.replace(OLD_URL, NEW_URL)
      // const newMaterialPack = material_pack.replace(OLD_URL, NEW_URL)

      await pool.query(
        `UPDATE sys_film_library
           SET material_pack = ? WHERE id = ?`,
        [newUrl, id],
      );
      console.log(`✅ updated id: ${id}`);
    } catch (err) {
      console.error(`❌ JSON parse error for id ${id}:`, err);
    }
  }

  await pool.end();
  console.log('🎉 All done');
}

main().catch(console.error);
