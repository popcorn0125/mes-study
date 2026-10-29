import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.List;
import java.util.stream.Stream;

/**
 * 스풀 CSV(1초 원본)를 백엔드와 같은 COPY로 Parquet(zstd)으로 바꿔 크기를 잰다. 원본 1행이 몇 바이트로 줄어드는지 본다.
 *
 *   java -cp <duckdb_jdbc.jar> bench/sensor-rollup/ParquetSize.java data/spool 결과폴더
 *
 * 출력(CSV): file,rows,csv_bytes,parquet_bytes,csv_bytes_per_row,parquet_bytes_per_row
 */
public class ParquetSize {

    private static final String COLUMNS = "{'equipment_id':'VARCHAR','recorded_at':'TIMESTAMPTZ','status':'VARCHAR',"
            + "'work_order_id':'VARCHAR','temperature':'DECIMAL(5,2)','vibration':'DECIMAL(5,2)','alarm_code':'VARCHAR'}";

    public static void main(String[] args) throws Exception {
        Path spoolDir = Path.of(args[0]);
        Path outDir = Path.of(args[1]);
        Files.createDirectories(outDir);
        List<Path> spools;
        try (Stream<Path> files = Files.list(spoolDir)) {
            spools = files.filter(p -> p.toString().endsWith(".csv")).sorted().toList();
        }
        System.out.println("file,rows,csv_bytes,parquet_bytes,csv_bytes_per_row,parquet_bytes_per_row");
        try (Connection duck = DriverManager.getConnection("jdbc:duckdb:"); Statement st = duck.createStatement()) {
            for (Path spool : spools) {
                Path parquet = outDir.resolve(spool.getFileName().toString().replace(".csv", ".parquet"));
                st.execute("COPY (SELECT * FROM read_csv('" + spool + "', header=true, columns=" + COLUMNS
                        + ") ORDER BY recorded_at, equipment_id) TO '" + parquet + "' (FORMAT parquet, COMPRESSION zstd)");
                long rows;
                try (ResultSet rs = st.executeQuery("SELECT count(*) FROM read_parquet('" + parquet + "')")) {
                    rs.next();
                    rows = rs.getLong(1);
                }
                long csv = Files.size(spool);
                long pq = Files.size(parquet);
                System.out.printf("%s,%d,%d,%d,%.1f,%.1f%n", spool.getFileName(), rows, csv, pq, (double) csv / rows, (double) pq / rows);
            }
        }
    }
}
