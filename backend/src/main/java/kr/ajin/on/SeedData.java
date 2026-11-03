package kr.ajin.on;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

@Component
class SeedData implements ApplicationRunner {
    private final JdbcClient jdbc;
    private final ObjectMapper mapper;
    SeedData(JdbcClient jdbc, ObjectMapper mapper) { this.jdbc = jdbc; this.mapper = mapper; }

    @Override
    @Transactional
    public void run(ApplicationArguments args) throws IOException {
        for (String page : PageService.PAGES.keySet()) {
            var resource = new ClassPathResource("seed/" + page + ".json");
            String source;
            try (var stream = resource.getInputStream()) {
                source = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
            }
            var seed = mapper.readTree(source);
            jdbc.sql("INSERT INTO page_state(page,state) VALUES(:page,CAST(:state AS jsonb)) ON CONFLICT(page) DO NOTHING")
                .param("page", page).param("state", mapper.writeValueAsString(seed.get("state"))).update();
            jdbc.sql("INSERT INTO page_reference(page,data) VALUES(:page,CAST(:data AS jsonb)) ON CONFLICT(page) DO UPDATE SET data=EXCLUDED.data")
                .param("page", page).param("data", mapper.writeValueAsString(seed.get("referenceData"))).update();
        }
    }
}
